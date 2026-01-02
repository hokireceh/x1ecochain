const { Telegraf } = require('telegraf');
const config = require('./config');
const handlers = require('./bot/handlers');
const auth = require('./services/auth');

if (!config.telegram.token) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required in .env');
  process.exit(1);
}

if (!config.x1api.walletPrivateKey) {
  console.error('ERROR: WALLET_PRIVATE_KEY is required in .env or Replit secrets');
  process.exit(1);
}

console.log(`🔑 Private Key: ${config.x1api.walletPrivateKey.slice(0, 10)}...${config.x1api.walletPrivateKey.slice(-6)}`);

async function initBot() {
  try {
    // Debug: Cek private key
    const { ethers } = require('ethers');
    const wallet = new ethers.Wallet(config.x1api.walletPrivateKey);
    console.log('🔐 Expected Address (from PK):', wallet.address);
    
    const token = await auth.getValidToken(config.x1api.walletPrivateKey);
    global.x1AuthToken = token;
    
    const api = require('./services/api');
    const { httpsAgent } = require('./services/api');
    const userInfo = await api.getUserInfo();
    
    // Debug: Print FULL response
    console.log('📥 API /me Response:', JSON.stringify(userInfo, null, 2));
    
    if (userInfo.success) {
      // Check both possible structures
      const userData = userInfo.data.user || userInfo.data;
      
      global.walletAddress = userData.address;
      console.log(`✅ Wallet Address: ${global.walletAddress}`);
      console.log(`📊 Points: ${userData.points || 0} | Rank: #${userData.rank || 'N/A'}`);
      
      // Verify if addresses match
      if (global.walletAddress.toLowerCase() !== wallet.address.toLowerCase()) {
        console.error('⚠️  WARNING: Address mismatch!');
        console.error(`   From Private Key: ${wallet.address}`);
        console.error(`   From API: ${global.walletAddress}`);
      } else {
        console.log('✅ Address verified - MATCH!');
      }
    } else {
      console.error('❌ Failed to get wallet address from API');
      process.exit(1);
    }
    
    // ✅ Initialize Telegraf with custom agent if needed
    const bot = new Telegraf(config.telegram.token, {
      handlerTimeout: 90000, // 90 seconds
      telegram: {
        agent: httpsAgent // Use the same keep-alive agent
      }
    });
    
    console.log('🤖 X1 EcoChain Bot started (Telegraf)!');
    console.log('Allowed users:', config.telegram.allowedUsers.length > 0 ? config.telegram.allowedUsers : 'All users');
    
    // Register command handlers
    bot.start((ctx) => handlers.handleStart(ctx));
    bot.hears(/^(0x[a-fA-F0-9]{40})(?:\s+(\S+))?/, (ctx) => handlers.handleTransfer(ctx));
    bot.on('callback_query', (ctx) => handlers.handleCallback(ctx));
    
    // Launch with improved polling
    bot.launch({
      polling: {
        timeout: 30, // Propper polling timeout
        limit: 100,
        allowedUpdates: ['message', 'callback_query']
      }
    });
    
    // ✅ GRACEFUL SHUTDOWN
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
    
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