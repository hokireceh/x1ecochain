require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    allowedUsers: process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',').map(id => parseInt(id.trim())) : []
  },
  x1api: {
    baseUrl: 'https://testnet-api.x1.one',
    faucetUrl: 'https://nft-api.x1.one/testnet/faucet',
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY
  }
};
