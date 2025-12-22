# X1 EcoChain Telegram Bot

A powerful Telegram bot for interacting with the X1 EcoChain ecosystem. Manage your wallet, complete quests, claim faucets, and send tokens directly from Telegram.

## 🚀 Features

- **👤 Profile Management** - View wallet address, points, rank, and linked accounts (X, Discord)
- **📋 Quest System** - Browse and auto-complete daily quests and social quests
- **💧 Faucet Claims** - Claim X1 testnet faucet tokens via standard and Discord methods
- **💸 Token Transfers** - Send X1T tokens directly to other addresses with balance checking
- **🔐 Wallet Integration** - Secure transactions using your Ethereum private key
- **⚡ Real-time Data** - Live blockchain balance and on-chain transactions

## 📋 Requirements

- Node.js v18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Ethereum wallet private key for X1 EcoChain
- Internet connection for API and blockchain access

## 🔧 Installation

### 1. Clone the Repository
```bash
git clone https://github.com/hokireceh/x1ecochain
cd x1ecochain
npm install
```

### 2. Create Environment File
```bash
cp .env.example .env
```

### 3. Configure Secrets

Add the following to your `.env` file or Replit secrets:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
WALLET_PRIVATE_KEY=your_wallet_private_key_here
ALLOWED_USER_IDS=1234567890,9876543210  # Optional: comma-separated Telegram user IDs
```

### 4. Start the Bot
```bash
npm start
```

The bot will:
- ✅ Initialize your wallet
- ✅ Generate/load authentication tokens
- ✅ Fetch your user profile
- ✅ Start listening for Telegram commands

## 📱 Usage

### Starting the Bot
Send `/start` to the bot in Telegram to see the main menu with all available options.

### Main Menu Options

#### 👤 My Profile
View your wallet address, X1T points, rank, and all linked social accounts (X, Discord).

#### 📋 All Quests
See all available quests with their details:
- Quest title and description
- Category (social, on-chain, etc.)
- Periodicity (daily, one-time)
- Reward points
- Completion status

#### 🎯 Daily Quests
View quests that reset daily. Shows:
- Pending quests for today
- Completion progress
- Reward amounts

**Auto Complete**: Click "🚀 Auto Daily" to complete all pending daily quests in one go.

#### 🌐 Social Quests
View social media related quests. Shows:
- Pending social tasks
- Associated platforms

**Auto Complete**: Click "📱 Auto Social" to complete all pending social quests.

#### 💧 Claim Faucet
Get free X1T tokens from the testnet faucet.

#### 🔗 DC Faucet
Get the Discord faucet command - copy and paste it in the X1 EcoChain Discord channel.

#### 💸 Send X1T
Transfer X1T tokens to another wallet address.

**How to use:**
1. Click "💸 Send X1T" button
2. View your current balance
3. Type: `<recipient_address> <amount>`
   - Example: `0xbE0bff0121f17EE0EC1F08976f936d714202face 1`
4. Confirm and wait for blockchain confirmation

## 🔐 Security

- **Private Keys**: Never share your wallet private key
- **Secrets Management**: Use Replit secrets or secure .env file
- **Authorization**: Optionally restrict bot access to specific Telegram user IDs
- **On-Chain Transactions**: All transfers are signed locally using ethers.js

## 🏗️ Project Structure

```
src/
├── index.js              # Bot initialization and message handlers
├── config/
│   └── index.js          # Configuration and environment loader
├── bot/
│   ├── handlers.js       # Telegram command and callback handlers
│   └── keyboards.js      # Inline keyboard layouts for menus
└── services/
    ├── api.js            # X1 API client and blockchain interactions
    └── auth.js           # Wallet authentication and token management
```

## 🔄 API Integration

### X1 EcoChain API
- **Base URL**: `https://tapi.kod.af`
- **Authentication**: JWT token (signed with wallet private key)
- **Endpoints**:
  - `/me` - Get user profile
  - `/quests` - List all quests
  - `/quests?quest_id=X` - Complete a quest

### Blockchain RPC
- **Network**: X1 EcoChain Testnet (Maculatus)
- **Chain ID**: 10778
- **RPC URL**: `https://maculatus-rpc.x1eco.com/`
- **Token**: X1T (native token)

## 🛠️ Development

### Environment Variables
```env
# Required
TELEGRAM_BOT_TOKEN=xxx
WALLET_PRIVATE_KEY=xxx

# Optional
ALLOWED_USER_IDS=1234567890,9876543210
USE_CLOUDSCRAPER=false  # Set to true if API has Cloudflare protection
```

### Adding New Features

1. **New Telegram Commands**: Edit `src/index.js` to register handlers
2. **New Menu Options**: Update `src/bot/keyboards.js` and add handlers in `src/bot/handlers.js`
3. **New API Calls**: Add functions in `src/services/api.js`
4. **Blockchain Operations**: Use ethers.js utilities in api.js

### Debugging
The bot logs all important information to console:
- 🔑 Private key verification
- 📤 API requests and responses
- ⛓️ Blockchain transactions
- ⚠️ Errors and warnings

## 📦 Dependencies

- `node-telegram-bot-api` - Telegram Bot API wrapper
- `ethers` - Ethereum wallet and blockchain interaction
- `axios` - HTTP client for API requests
- `cloudscraper` - Cloudflare protection bypass (optional)
- `dotenv` - Environment variable management

## ❌ Troubleshooting

### Bot Not Starting
- Check TELEGRAM_BOT_TOKEN is valid
- Ensure WALLET_PRIVATE_KEY is set
- Verify internet connection

### Transfer Fails with "Insufficient Balance"
- Use `/start` → `👤 My Profile` to check your X1T balance
- Claim from faucet first: `💧 Claim Faucet`

### API 401 (Unauthorized)
- Bot will automatically refresh authentication token
- If persists, check WALLET_PRIVATE_KEY is correct

### RPC Connection Error
- Network might be temporarily unavailable
- Try again in a few moments
- Check https://maculatus-rpc.x1eco.com/ is accessible

### Cloudflare Protection
Set `USE_CLOUDSCRAPER=true` in .env to bypass Cloudflare challenges.

## 📄 License

MIT License - Feel free to use and modify for your needs.

## 🤝 Support

For issues and feature requests, please create an issue on GitHub.

## 📚 Resources

- [Telegram Bot API Docs](https://core.telegram.org/bots)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [X1 EcoChain Documentation](https://x1.one/)
