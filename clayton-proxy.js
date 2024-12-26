const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const readline = require("readline");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, loadData, getRandomNumber } = require("./utils");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { checkBaseUrl } = require("./checkAPI");

class Clayton {
  constructor(queryId, accountIndex, proxy, baseURL) {
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      Origin: "https://tonclayton.fun",
      Referer: "https://tonclayton.fun/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    };
    this.baseURL = baseURL;
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.session_user_agents = this.#load_session_data();
    this.skipTasks = settings.SKIP_TASKS;
    this.wallets = this.loadWallets();
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    console.log(`[Account ${this.accountIndex + 1}] Create user agent...`.blue);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  #set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    const telegramauth = this.queryId;
    const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
    this.session_name = userData.id;
    this.#get_user_agent();
  }

  loadWallets() {
    try {
      const walletFile = path.join(__dirname, "wallets.txt");
      if (fs.existsSync(walletFile)) {
        return fs.readFileSync(walletFile, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
      }
      return [];
    } catch (error) {
      this.log(`Error reading wallet file: ${error.message}`, "error");
      return [];
    }
  }

  async log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const accountPrefix = `[Account ${this.accountIndex + 1}]`;
    const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }
    console.log(logMessage);
  }

  async countdown(seconds) {
    for (let i = seconds; i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`===== Wait ${i} seconds to continue loop =====`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    this.log("", "info");
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async makeRequest(url, method, data = {}) {
    const headers = {
      ...this.headers,
      "Init-Data": this.queryId,
    };
    const proxyAgent = new HttpsProxyAgent(this.proxy);
    let retries = 0,
      success = false;
    while (retries < 2 && !success) {
      retries++;
      try {
        const response = await axios({
          method,
          url,
          data,
          headers,
          httpsAgent: proxyAgent,
          timeout: 30000,
        });
        success = true;
        return { success: true, data: response.data };
      } catch (error) {
        if (error.status === 429) {
          this.log(`Too many requests wait 2 ~ 3 minutes to retry: ${url}...`, "warning");
          await sleep([120, 180]);
        } else {
          this.log(`Request failed: ${url} | ${error.message} | trying again...`, "warning");
          await sleep(settings.DELAY_BETWEEN_REQUESTS);
        }
        success = false;
        return { success: false, error: error.message };
      }
    }
  }

  async login() {
    return this.makeRequest(`${this.baseURL}/user/authorization`, "post");
  }

  async dailyClaim() {
    return this.makeRequest(`${this.baseURL}/user/daily-claim`, "post");
  }

  async saveBalance() {
    return this.makeRequest(`${this.baseURL}/user/save-user`, "post");
  }

  async getPartnerTasks() {
    return this.makeRequest(`${this.baseURL}/tasks/partner-tasks`, "get");
  }

  async completeTask(taskId) {
    return this.makeRequest(`${this.baseURL}/tasks/complete`, "post", { task_id: taskId });
  }

  async rewardPartnerTask(taskId) {
    return this.makeRequest(`${this.baseURL}/tasks/claim`, "post", { task_id: taskId });
  }

  async handlePartnerTasks() {
    let fetchAttempts = 0;
    const maxAttempts = 3;

    while (fetchAttempts < maxAttempts) {
      fetchAttempts++;
      const tasksResult = await this.getPartnerTasks();

      if (tasksResult.success) {
        const uncompletedTasks = tasksResult.data.filter((task) => !settings.SKIP_TASKS.includes(task.task_id) && !task.is_completed && !task.is_claimed);
        for (const task of uncompletedTasks) {
          this.log(`Start the mission ${task.task_id} | ${task.task.title}...`);

          let taskAttempts = 0;
          while (taskAttempts < maxAttempts) {
            taskAttempts++;
            const completeResult = await this.completeTask(task.task_id);
            if (completeResult.success) {
              const rewardResult = await this.rewardPartnerTask(task.task_id);
              if (rewardResult.success) {
                this.log(`Do the task ${task.task.title} successful. Received ${task.task.reward_tokens} CL`, "success");
                break;
              }
            } else {
              if (taskAttempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
              }
            }
          }
          if (taskAttempts === maxAttempts) {
            this.log(`Unable to complete the task ${task.task.title} after ${maxAttempts} try. Skip this quest.`, "warning");
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        return;
      } else {
        if (fetchAttempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }

    if (fetchAttempts === maxAttempts) {
      this.log(`Failed to get partner task list after ${maxAttempts} attempts. Skipping partner task processing.`, "error");
    }
  }

  async getDailyTasks() {
    return this.makeRequest(`${this.baseURL}/tasks/daily-tasks`, "get");
  }

  async completeDailyTask(taskId) {
    return this.makeRequest(`${this.baseURL}/tasks/complete`, "post", { task_id: taskId });
  }

  async claimDailyTask(taskId) {
    return this.makeRequest(`${this.baseURL}/tasks/claim`, "post", { task_id: taskId });
  }

  async checkOGPass() {
    return this.makeRequest(`${this.baseURL}/pass/get`, "get");
  }

  async claimOGPass() {
    return this.makeRequest(`${this.baseURL}/pass/claim`, "post");
  }

  async handleDailyTasks() {
    let fetchAttempts = 0;
    const maxAttempts = 3;

    while (fetchAttempts < maxAttempts) {
      fetchAttempts++;
      const tasksResult = await this.getDailyTasks();
      const skipStack = settings.AUTO_PLAY_GAME_1204;
      const skip1204 = settings.AUTO_PLAY_GAME_STACK;
      if (tasksResult.success) {
        const uncompletedTasks = tasksResult.data.filter((task) => {
          const isTaskIdValid = skipStack ? task.task_id !== 4 : true;
          const isTaskId1204Valid = skip1204 ? task.task_id !== 3 : true;
          return !settings.SKIP_TASKS.includes(task.task_id) && !task.is_completed && !task.is_claimed && isTaskIdValid && isTaskId1204Valid;
        });
        for (const task of uncompletedTasks) {
          this.log(`Start the mission ${task.task_id} | ${task.task.title}...`);

          let taskAttempts = 0;
          while (taskAttempts < maxAttempts) {
            taskAttempts++;
            const completeResult = await this.completeDailyTask(task.task_id);
            if (completeResult.success) {
              const claimResult = await this.claimDailyTask(task.task_id);
              if (claimResult.success) {
                this.log(`Do the task ${task.task.title} successful. Received ${claimResult.data.reward_tokens} CL`, "success");
                this.log(`Total CL: ${claimResult.data.total_tokens} | Number of game plays: ${claimResult.data.game_attempts}`, "info");
                break;
              } else {
                this.log(`Cannot receive quest rewards ${task.task.title}: ${claimResult.error || "Unknown error"}`, "error");
              }
            } else {
              if (taskAttempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
              }
            }
          }
          if (taskAttempts === maxAttempts) {
            this.log(`Unable to complete the task ${task.task.title} after ${maxAttempts} try. Skip this quest.`, "warning");
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        return;
      } else {
        if (fetchAttempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }

    if (fetchAttempts === maxAttempts) {
      this.log(`Failed to get daily tasks list after ${maxAttempts} attempts. Skipping daily tasks processing.`, "error");
    }
  }

  async play2048() {
    const startGameResult = await this.makeRequest(`${this.baseURL}/game/start`, "post");
    if (!startGameResult.success || startGameResult.data.message !== "Game started successfully") {
      this.log("Cannot start 2048 game", "error");
      return;
    }

    this.log("The 2048 game has started successfully", "success");
    const session_id = startGameResult.data.session_id;
    let maxTile = 2;
    const fixedMilestones = [4, 8, 16, 32, 64, 128, 256, 512, 1024];
    const allMilestones = [...fixedMilestones].sort((a, b) => a - b);
    const gameEndTime = Date.now() + 150000;

    for (const milestone of allMilestones) {
      if (Date.now() >= gameEndTime) break;
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10000 + 5000));
      const saveGameResult = await this.makeRequest(`${this.baseURL}/game/save-tile`, "post", { maxTile: milestone, session_id });
      if (saveGameResult.success && saveGameResult.data.message === "MaxTile saved successfully") {
        maxTile = milestone;
        this.log(`Cell reached ${milestone}`, "success");
      }
    }
    await sleep(3);
    const endGameResult = await this.makeRequest(`${this.baseURL}/game/over`, "post", { maxTile, multiplier: 1, session_id });
    if (endGameResult.success) {
      const reward = endGameResult.data;
      this.log(`The 2048 game has ended successfully. Get ${reward.earn} CL and ${reward.xp_earned} XP`, "success");
    } else {
      this.log(`Error Game 2048 End: ${endGameResult.error || "Unknown error"}`, "error");
    }

    await sleep(5);
  }

  async playStack() {
    const startGameResult = await this.makeRequest(`${this.baseURL}/stack/st-game`, "post");
    if (!startGameResult.success) {
      this.log("Cannot start Stack game", "error");
      return;
    }

    this.log("The Stack Game has started successfully", "success");

    const gameEndTime = Date.now() + 120000;
    const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    let currentScoreIndex = 0;

    while (Date.now() < gameEndTime && currentScoreIndex < scores.length) {
      const score = scores[currentScoreIndex];
      // await sleep(5);
      const updateResult = await this.makeRequest(`${this.baseURL}/stack/update-game`, "post", { score });
      if (updateResult.success) {
        this.log(`Update Stack Points: ${score}`, "success");
        currentScoreIndex++;
      } else {
        this.log(`Stack Point Update Error: ${updateResult.error || "Unknown error"}`, "error");
      }

      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10000 + 5000));
    }

    const numberBonus = getRandomNumber(1, 9);
    const finalScore = (scores[currentScoreIndex - 1] || 90) + numberBonus;

    const endGameResult = await this.makeRequest(`${this.baseURL}/stack/en-game`, "post", { score: finalScore, multiplier: 1 });
    if (endGameResult.success) {
      const reward = endGameResult.data;
      this.log(`The Stack Game has ended successfully. Get ${reward.earn} CL and ${reward.xp_earned} XP`, "success");
    } else {
      this.log(`Stack End Game Error: ${endGameResult.error || "Unknown error"}`, "error");
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  async playGames(tickets) {
    let currTicket = parseInt(tickets);
    while (currTicket > 0) {
      await sleep(settings.DELAY_BETWEEN_GAME[0], settings.DELAY_BETWEEN_GAME[1]);

      this.log(`Current ticket number: ${currTicket}`, "info");
      if (settings.AUTO_PLAY_GAME_1204 && !settings.AUTO_PLAY_GAME_STACK) {
        await this.play2048();
      } else if (!settings.AUTO_PLAY_GAME_1204 && settings.AUTO_PLAY_GAME_STACK) {
        await this.playStack();
      } else {
        if (currTicket % 2 === 0) {
          await this.play2048();
        } else {
          await this.playStack();
        }
      }
      currTicket--;
    }
  }

  async connectwallet(wallet) {
    if (!wallet) return this.log("Wallet address not found...skip", "warning");
    const res = await this.makeRequest(`${this.baseURL}/user/wallet`, "post", { wallet });
    if (res?.data?.ok) {
      this.log(`Wallet connection successful: ${res.data.wallet}`.green);
    } else {
      this.log(`Unable to connect wallet, maybe wallet is already linked to another account: ${res?.data?.error}`.yellow);
    }
  }

  async handleDefaultTasks() {
    let tasksResult;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      tasksResult = await this.makeRequest(`${this.baseURL}/tasks/default-tasks`, "get");

      if (tasksResult.success) {
        break;
      } else {
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }

    if (!tasksResult.success) {
      this.log(`Failed to get default task list after ${maxAttempts} attempts. Skipping default task processing.`, "error");
      return;
    }

    const incompleteTasks = tasksResult.data.filter((task) => !settings.SKIP_TASKS.includes(task.task_id) && !task.is_completed && task.task_id !== 9);

    for (const task of incompleteTasks) {
      this.log(`Start the mission ${task.task_id} | ${task.task.title}...`);

      const completeResult = await this.makeRequest(`${this.baseURL}/tasks/complete`, "post", { task_id: task.task_id });

      if (!completeResult.success) {
        continue;
      }

      const claimResult = await this.makeRequest(`${this.baseURL}/tasks/claim`, "post", { task_id: task.task_id });

      if (claimResult.success) {
        const reward = claimResult.data;
        this.log(`Do the task ${task.task.title} success. reward ${reward.reward_tokens} CL | Balance: ${reward.total_tokens}`, "success");
      } else {
        this.log(`Cannot receive quest rewards ${task.task.title}: ${claimResult.error || "Unknown error"}`, "error");
      }

      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5000 + 2000));
    }
  }

  async handleSuperTasks() {
    let SuperTasks;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      SuperTasks = await this.makeRequest(`${this.baseURL}/tasks/super-tasks`, "get");
      if (SuperTasks.success) {
        break;
      } else {
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }

    if (!SuperTasks.success) {
      this.log(`Failed to get list of advanced tasks after ${maxAttempts} attempts. Skipping advanced task processing.`, "error");
      return;
    }

    const incompleteTasks = SuperTasks.data.filter((task) => !settings.SKIP_TASKS.includes(task.task_id) && !task.is_completed);

    for (const task of incompleteTasks) {
      this.log(`Start the mission ${task.task_id} | ${task.task.title}...`);

      const completeResult = await this.makeRequest(`${this.baseURL}/tasks/complete`, "post", { task_id: task.task_id });

      if (!completeResult.success) {
        continue;
      }

      const claimResult = await this.makeRequest(`${this.baseURL}/tasks/claim`, "post", { task_id: task.task_id });

      if (claimResult.success) {
        const reward = claimResult.data;
        this.log(`Do the task ${task.task.title} success. reward ${reward.reward_tokens} CL | Balance: ${reward.total_tokens}`, "success");
      } else {
        this.log(`Cannot receive quest rewards ${task.task.title}: ${claimResult.error || "Unknown error"}`, "error");
      }

      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5000 + 2000));
    }
  }

  async runAccount() {
    try {
      this.proxyIP = await this.checkProxyIP();
    } catch (error) {
      this.log(`Cannot check proxy IP: ${error.message}`, "warning");
      return;
    }

    const accountIndex = this.accountIndex;
    const initData = this.queryId;
    const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
    const firstName = userData.first_name || "";
    const lastName = userData.last_name || "";
    this.session_name = userData.id;
    const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
    console.log(`=========Account ${accountIndex + 1}| ${firstName + " " + lastName} | ${this.proxyIP} | Start later ${timesleep} second...`.green);
    this.#set_headers();
    await sleep(timesleep);

    let loginSuccess = false;
    let loginAttempts = 0;
    let loginResult;

    while (!loginSuccess && loginAttempts < 3) {
      loginAttempts++;
      this.log(`Log in... (Attempt) ${loginAttempts})`, "info");
      loginResult = await this.login();
      if (loginResult.success) {
        loginSuccess = true;
      } else {
        this.log(`Login failed: ${loginResult.error}`, "error");
        if (loginAttempts < 3) {
          this.log("Retry...", "info");
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }

    if (!loginSuccess) {
      this.log("Login failed after 3 attempts. Account abandoned.", "error");
      return;
    }

    const userInfo = loginResult.data.user;
    this.log(`CL: ${userInfo.tokens} CL | ${userInfo.daily_attempts} Ticket | OGPass: ${userInfo.has_og_pass.toString()}`, "info");

    if (!userInfo.is_saved) {
      this.log("Protecting tokens...", "info");
      const saveResult = await this.saveBalance();
      if (saveResult.success) {
        this.log("Token protected successfully!", "success");
      } else {
        this.log(`Unable to protect token: ${saveResult.error || "Unknown error"}`, "error");
      }
    }

    if (!userInfo.has_og_pass) {
      this.log("Checking OG PASS...", "info");
      const ogRes = await this.checkOGPass();
      if (ogRes.success && ogRes?.data?.can_claim_pass) {
        const claimRess = await this.claimOGPass();
        if (claimRess.success) {
          this.log("Get OG PASS successfully!", "success");
        }
      } else {
        this.log(`Not eligible for OG Pass!`, "warning");
      }
    }

    if (loginResult.data.dailyReward.can_claim_today) {
      this.log("Claim Daily Rewards...", "info");
      const claimResult = await this.dailyClaim();
      if (claimResult.success) {
        this.log("Daily reward has been successfully claimed!", "success");
      } else {
        this.log(`Cannot claim daily rewards: ${claimResult.error || "Unknown error"}`, "error");
      }
    }

    if (settings.CONNECT_WALLET) {
      await sleep(3);
      if (userInfo.wallet) {
        this.log(`Account linked wallet: ${userInfo.wallet}`);
      } else {
        this.log(`Start linking wallet...`);
        await this.connectwallet(this.wallets[this.accountIndex]);
      }
    }

    if (settings.AUTO_PLAY_GAME) {
      await sleep(3);
      let tickets = userInfo.daily_attempts;
      if (userInfo.daily_attempts > 0) {
        await this.playGames(tickets);
      } else {
        this.log(`No more game tickets`, "warning");
      }
    }

    if (settings.AUTO_TASK) {
      await sleep(3);
      await this.handleDefaultTasks();
      await sleep(3);
      await this.handlePartnerTasks();
      await sleep(3);
      await this.handleDailyTasks();
      await sleep(3);
      await this.handleSuperTasks();
    }
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy, hasIDAPI } = workerData;
  const to = new Clayton(queryId, accountIndex, proxy, hasIDAPI);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");
  // const agents = #load_session_data();
  const wallets = loadData("wallets.txt");

  if (queryIds.length > proxies.length) {
    console.log("The number of proxies and data must be equal..".red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  console.log("Hi I'm @Sayfull-XD, I hope you are always healthy🔥".yellow);
  let maxThreads = settings.MAX_THEADS;

  const { endpoint: hasIDAPI, message } = await checkBaseUrl();
  if (!hasIDAPI) return console.log(`API ID not found, try again later!`.red);
  console.log(`${message}`.yellow);
  // process.exit();
  queryIds.map((val, i) => new Clayton(val, i, proxies[i], hasIDAPI).createUserAgent());

  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            wallets,
            hasIDAPI,
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              if (message.error) {
                // console.log(`Account ${message.accountIndex}: ${message.error}`);
              }
              resolve();
            });
            worker.on("error", (error) => {
              errors.push(`Worker error for account ${currentIndex}: ${error.message}`);
              worker.terminate();
            });
            worker.on("exit", (code) => {
              worker.terminate();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    const to = new Clayton(null, 0, proxies[0], hasIDAPI);
    await sleep(3);
    console.log("Hi I'm @Sayfull-XD, I hope you are always healthy🔥".yellow);
    console.log(`=============Complete all accounts=============`.magenta);
    await to.countdown(settings.TIME_SLEEP * 60 * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Error:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
