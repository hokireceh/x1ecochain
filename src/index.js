const { Telegraf } = require('telegraf');
const config = require('./config');
const handlers = require('./bot/handlers');
const auth = require('./services/auth');
const scheduler = require('./services/scheduler');

if (!config.telegram.token) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required in .env');
  process.exit(1);
}

if (!config.x1api.walletPrivateKey) {
  console.error('ERROR: WALLET_PRIVATE_KEY is required in .env or Replit secrets');
  process.exit(1);
}

async function initBot() {
  try {
    const { ethers } = require('ethers');
    const wallet = new ethers.Wallet(config.x1api.walletPrivateKey);
    console.log('🔐 Wallet Address:', wallet.address);

    const token = await auth.getValidToken(config.x1api.walletPrivateKey);
    global.x1AuthToken = token;

    const api = require('./services/api');
    const { httpsAgent } = require('./services/api');
    const userInfo = await api.getUserInfo();

    if (userInfo.success) {
      const userData = userInfo.data.user || userInfo.data;
      global.walletAddress = userData.address;
      console.log(`✅ Wallet: ${global.walletAddress}`);
      console.log(`📊 Points: ${userData.points || 0} | Rank: #${userData.rank || 'N/A'}`);
    } else {
      console.error('❌ Failed to get wallet address from API');
      process.exit(1);
    }

    const bot = new Telegraf(config.telegram.token, {
      handlerTimeout: 120000,
      telegram: {
        agent: httpsAgent,
        apiRoot: 'https://api.telegram.org'
      }
    });

    console.log('🤖 X1 EcoChain Bot started!');
    console.log('Allowed users:', config.telegram.allowedUsers.length > 0 ? config.telegram.allowedUsers : 'All users');

    // Register command handlers
    bot.start((ctx) => handlers.handleStart(ctx));
    bot.hears(/^(0x[a-fA-F0-9]{40})(?:\s+(\S+))?/, (ctx) => handlers.handleTransfer(ctx));
    bot.on('callback_query', (ctx) => handlers.handleCallback(ctx));

    // Launch bot
    bot.launch({
      polling: {
        timeout: 30,
        limit: 100,
        allowedUpdates: ['message', 'callback_query']
      }
    });

    // Start auto scheduler
    scheduler.startScheduler(bot);

    // Graceful shutdown
    process.once('SIGINT', () => {
      scheduler.stopScheduler();
      bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      scheduler.stopScheduler();
      bot.stop('SIGTERM');
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught exception:', error);
    });

    process.on('unhandledRejection', (error) => {
      console.error('❌ Unhandled rejection:', error);
    });

  } catch (err) {
    console.error('❌ Failed to initialize bot:', err.message);
    console.error('Full error:', err);
    process.exit(1);
  }
}

initBot();
