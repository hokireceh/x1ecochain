require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    allowedUsers: process.env.ALLOWED_USER_IDS
      ? process.env.ALLOWED_USER_IDS.split(',').map(id => parseInt(id.trim()))
      : []
  },
  x1api: {
    baseUrl: 'https://testnet-api.x1eco.com',
    faucetUrl: 'https://nft-api.x1eco.com/testnet/faucet',
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY
  },
  scheduler: {
    enabled: process.env.AUTO_SCHEDULER !== 'false',
    hour: parseInt(process.env.AUTO_HOUR || '0'),
    minute: parseInt(process.env.AUTO_MINUTE || '5'),
    timezone: process.env.AUTO_TIMEZONE || 'Asia/Jakarta',
    autoFaucet: process.env.AUTO_FAUCET !== 'false',
    autoDailyQuests: process.env.AUTO_DAILY_QUESTS !== 'false',
    autoSwap: process.env.AUTO_SWAP === 'true',
    swapAmount: parseFloat(process.env.SWAP_AMOUNT || '0.01'),
    autoLiquidity: process.env.AUTO_LIQUIDITY === 'true',
    liquidityAmount: parseFloat(process.env.LIQUIDITY_AMOUNT || '0.01')
  }
};
