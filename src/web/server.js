const express = require('express');
const path = require('path');
const { ethers } = require('ethers');
const tokenCreator = require('../services/tokenCreator');
const config = require('../config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

const RPC_URL = 'https://maculatus-rpc.x1eco.com/';

app.get('/api/wallet', async (req, res) => {
  try {
    const wallet = new ethers.Wallet(config.x1api.walletPrivateKey);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const balanceWei = await provider.getBalance(wallet.address);
    const balance = parseFloat(ethers.formatEther(balanceWei));
    res.json({ success: true, address: wallet.address, balance: balance.toFixed(4) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/create-token', async (req, res) => {
  try {
    const { name, symbol, decimals, supply, features } = req.body;

    if (!name || !symbol || decimals === undefined || !supply) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    if (name.length < 1 || name.length > 50) {
      return res.status(400).json({ success: false, error: 'Token name must be 1-50 characters' });
    }
    const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (sym.length < 1 || sym.length > 10) {
      return res.status(400).json({ success: false, error: 'Symbol must be 1-10 alphanumeric characters' });
    }
    const dec = parseInt(decimals);
    if (isNaN(dec) || dec < 0 || dec > 18) {
      return res.status(400).json({ success: false, error: 'Decimals must be 0-18' });
    }
    const sup = parseInt(supply);
    if (isNaN(sup) || sup < 1 || sup > 1000000000000) {
      return res.status(400).json({ success: false, error: 'Supply must be between 1 and 1,000,000,000,000' });
    }

    const result = await tokenCreator.performCreateToken({
      name: name.trim(),
      symbol: sym,
      decimals: dec,
      supply: sup,
      features: features || []
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/my-tokens', async (req, res) => {
  try {
    const result = await tokenCreator.getMyTokens();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message, tokens: [] });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

function startWebServer(port = 5000) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Web server running on port ${port}`);
  });
}

module.exports = { startWebServer };
