const cloudscraper = require('cloudscraper');
const config = require('../config');
const auth = require('./auth');
const dns = require('dns');
const https = require('https');

// Force IPv4 first
dns.setDefaultResultOrder('ipv4first');

// HTTPS Keep-Alive Agent
    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 100,
      timeout: 60000
    });

// Toggle between axios and cloudscraper
const USE_CLOUDSCRAPER = process.env.USE_CLOUDSCRAPER === 'true' || false;

async function fetchWithRetry(fn, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      const backoff = delay * Math.pow(2, i);
      console.log(`⚠️ Request failed, retrying in ${backoff}ms... (${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

function getApiClient() {
  if (USE_CLOUDSCRAPER) {
    return {
      get: (url, options = {}) => {
        return fetchWithRetry(() => cloudscraper.get(`${config.x1api.baseUrl}${url}`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': global.x1AuthToken || '',
            'areyouahuman': 'true',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...options.headers
          },
          timeout: 30000,
          agent: httpsAgent
        })).then(body => ({ data: JSON.parse(body) }));
      },
      post: (url, data, options = {}) => {
        return fetchWithRetry(() => cloudscraper.post(`${config.x1api.baseUrl}${url}`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': global.x1AuthToken || '',
            'areyouahuman': 'true',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...options.headers
          },
          body: JSON.stringify(data),
          timeout: 30000,
          agent: httpsAgent,
          ...options.params && { qs: options.params }
        })).then(body => ({ data: JSON.parse(body) }));
      }
    };
  } else {
    // Use axios (original) with improved timeout
    const axios = require('axios');
    return axios.create({
      baseURL: config.x1api.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': global.x1AuthToken || '',
        'areyouahuman': 'true'
      },
      timeout: 30000,
      httpsAgent: httpsAgent
    });
  }
}

function getFaucetClient() {
  if (USE_CLOUDSCRAPER) {
    return {
      get: (url) => {
        return cloudscraper.get(url, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': global.x1AuthToken || '',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }).then(body => ({ data: JSON.parse(body) }));
      }
    };
  } else {
    const axios = require('axios');
    return axios.create({
      baseURL: 'https://nft-api.x1.one',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': global.x1AuthToken || ''
      }
    });
  }
}

function formatError(error) {
  if (typeof error === 'string') return error;
  
  // Handle AggregateError (multiple errors combined)
  if (error?.errors && Array.isArray(error.errors)) {
    const messages = error.errors.map(e => e.message || String(e)).join(', ');
    return `Multiple errors: ${messages}`;
  }
  
  if (error?.message) return error.message;
  if (error?.error) return error.error;
  if (error?.code) return `Error Code: ${error.code}`;
  if (typeof error === 'object') return JSON.stringify(error);
  return 'Unknown error occurred';
}

async function getUserInfo() {
  try {
    const apiClient = getApiClient();
    const response = await apiClient.get('/me');
    return { success: true, data: response.data };
  } catch (error) {
    // Check if it's Cloudflare challenge
    if (error.message?.includes('captcha') || error.statusCode === 403) {
      console.error('⚠️  Cloudflare protection detected. Set USE_CLOUDSCRAPER=true in .env');
    }
    
    if (error.response?.status === 401 || error.statusCode === 401) {
      console.log('⏰ API returned 401 - refreshing token...');
      try {
        global.x1AuthToken = await auth.getValidToken(config.x1api.walletPrivateKey);
        const apiClient = getApiClient();
        const response = await apiClient.get('/me');
        console.log('✅ Retry after token refresh - success!');
        return { success: true, data: response.data };
      } catch (refreshErr) {
        const errorMsg = formatError(refreshErr.response?.data || refreshErr);
        console.error('❌ Failed to refresh token:', errorMsg);
        return { success: false, error: 'Token refresh failed' };
      }
    }
    const errorMsg = formatError(error.response?.data || error);
    console.error('❌ getUserInfo error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function getQuests() {
  try {
    const apiClient = getApiClient();
    const response = await apiClient.get('/quests');
    return { success: true, data: response.data };
  } catch (error) {
    if (error.message?.includes('captcha') || error.statusCode === 403) {
      console.error('⚠️  Cloudflare protection detected. Set USE_CLOUDSCRAPER=true in .env');
    }
    
    if (error.response?.status === 401 || error.statusCode === 401) {
      console.log('⏰ API returned 401 - refreshing token...');
      try {
        global.x1AuthToken = await auth.getValidToken(config.x1api.walletPrivateKey);
        const apiClient = getApiClient();
        const response = await apiClient.get('/quests');
        console.log('✅ Retry after token refresh - success!');
        return { success: true, data: response.data };
      } catch (refreshErr) {
        const errorMsg = formatError(refreshErr.response?.data || refreshErr);
        console.error('❌ Failed to refresh token:', errorMsg);
        return { success: false, error: 'Token refresh failed' };
      }
    }
    const errorMsg = formatError(error.response?.data || error);
    console.error('❌ getQuests error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function completeQuest(questId) {
  try {
    const apiClient = getApiClient();
    const response = await apiClient.post('/quests', null, {
      params: { quest_id: questId }
    });
    return { success: true, data: response.data };
  } catch (error) {
    if (error.message?.includes('captcha') || error.statusCode === 403) {
      console.error('⚠️  Cloudflare protection detected. Set USE_CLOUDSCRAPER=true in .env');
    }
    
    if (error.response?.status === 401 || error.statusCode === 401) {
      console.log('⏰ API returned 401 - refreshing token...');
      try {
        global.x1AuthToken = await auth.getValidToken(config.x1api.walletPrivateKey);
        const apiClient = getApiClient();
        const response = await apiClient.post('/quests', null, {
          params: { quest_id: questId }
        });
        console.log('✅ Retry after token refresh - success!');
        return { success: true, data: response.data };
      } catch (refreshErr) {
        const errorMsg = formatError(refreshErr.response?.data || refreshErr);
        console.error('❌ Failed to refresh token:', errorMsg);
        return { success: false, error: 'Token refresh failed' };
      }
    }
    const errorMsg = formatError(error.response?.data || error);
    console.error('❌ completeQuest error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function claimFaucet() {
  try {
    const address = global.walletAddress;
    const faucetClient = getFaucetClient();
    
    if (USE_CLOUDSCRAPER) {
      const response = await faucetClient.get(`https://nft-api.x1.one/testnet/faucet?address=${address}`);
      return { success: true, data: response.data };
    } else {
      const response = await faucetClient.get(`/testnet/faucet?address=${address}`);
      return { success: true, data: response.data };
    }
  } catch (error) {
    if (error.message?.includes('captcha') || error.statusCode === 403) {
      console.error('⚠️  Cloudflare protection detected. Set USE_CLOUDSCRAPER=true in .env');
    }
    
    if (error.response?.status === 401 || error.statusCode === 401) {
      console.log('⏰ API returned 401 - refreshing token...');
      try {
        global.x1AuthToken = await auth.getValidToken(config.x1api.walletPrivateKey);
        const address = config.x1api.walletAddress;
        const faucetClient = getFaucetClient();
        
        if (USE_CLOUDSCRAPER) {
          const response = await faucetClient.get(`https://nft-api.x1.one/testnet/faucet?address=${address}`);
          return { success: true, data: response.data };
        } else {
          const response = await faucetClient.get(`/testnet/faucet?address=${address}`);
          return { success: true, data: response.data };
        }
      } catch (refreshErr) {
        const errorMsg = formatError(refreshErr.response?.data || refreshErr);
        console.error('❌ Failed to refresh token:', errorMsg);
        return { success: false, error: 'Token refresh failed' };
      }
    }
    const errorMsg = formatError(error.response?.data || error);
    console.error('❌ claimFaucet error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

async function getDailyQuests() {
  const result = await getQuests();
  if (!result.success) return result;
  
  // Filter untuk daily quests yang active dan belum completed hari ini
  const dailyQuests = result.data.filter(q => 
    q.periodicity === 'daily' && 
    q.is_active &&
    !q.is_completed_today
  );
  return { success: true, data: dailyQuests };
}

async function completeDailyQuests() {
  const results = [];
  const dailyResult = await getDailyQuests();
  
  if (!dailyResult.success) {
    return { success: false, error: dailyResult.error };
  }

  if (dailyResult.data.length === 0) {
    return { success: true, data: [], message: 'No pending daily quests' };
  }

  for (const quest of dailyResult.data) {
    const result = await completeQuest(quest.id);
    results.push({
      questId: quest.id,
      title: quest.title,
      reward: quest.reward,
      type: quest.type,
      ...result
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { success: true, data: results };
}

async function getSocialQuests() {
  const result = await getQuests();
  if (!result.success) return result;
  
  // Filter untuk social quests yang active dan belum completed
  const socialQuests = result.data.filter(q => 
    q.category === 'social' && 
    q.is_active &&
    !q.is_completed
  );
  return { success: true, data: socialQuests };
}

async function completeSocialQuests() {
  const results = [];
  const socialResult = await getSocialQuests();
  
  if (!socialResult.success) {
    return { success: false, error: socialResult.error };
  }

  if (socialResult.data.length === 0) {
    return { success: true, data: [], message: 'No pending social quests' };
  }

  for (const quest of socialResult.data) {
    const result = await completeQuest(quest.id);
    results.push({
      questId: quest.id,
      title: quest.title,
      reward: quest.reward,
      category: quest.category,
      ...result
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { success: true, data: results };
}

async function sendTransfer(toAddress, amount) {
  try {
    const { ethers } = require('ethers');
    
    // X1 EcoChain RPC configuration
    const RPC_URL = 'https://maculatus-rpc.x1eco.com/';
    const CHAIN_ID = 10778;
    
    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(config.x1api.walletPrivateKey, provider);
    
    console.log('🔐 Sending transaction from:', wallet.address);
    console.log('📤 To:', toAddress);
    console.log('💰 Amount:', amount, 'X1T');
    
    // Convert amount to wei (18 decimal places for X1T)
    const amountWei = ethers.parseEther(amount.toString());
    
    // Create and send transaction
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei
    });
    
    console.log('📝 Transaction hash:', tx.hash);
    console.log('⏳ Waiting for confirmation...');
    
    // Wait for transaction receipt
    const receipt = await tx.wait();
    
    if (receipt && receipt.status === 1) {
      console.log('✅ Transaction confirmed!');
      return { 
        success: true, 
        data: {
          tx_hash: tx.hash,
          from: wallet.address,
          to: toAddress,
          amount: amount,
          block: receipt.blockNumber,
          message: 'Transfer completed successfully'
        }
      };
    } else {
      return { 
        success: false, 
        error: 'Transaction failed or reverted' 
      };
    }
    
  } catch (error) {
    console.error('❌ Transfer error:', error.message);
    
    // Provide helpful error messages
    if (error.message?.includes('insufficient funds')) {
      return { success: false, error: '❌ Insufficient balance for transfer' };
    } else if (error.message?.includes('invalid address')) {
      return { success: false, error: '❌ Invalid recipient address' };
    } else if (error.message?.includes('nonce')) {
      return { success: false, error: '❌ Transaction nonce error - try again' };
    } else if (error.message?.includes('NETWORK_ERROR')) {
      return { success: false, error: '❌ Network connection error - RPC unavailable' };
    }
    
    return { success: false, error: error.message };
  }
}

async function getBalance() {
  try {
    const { ethers } = require('ethers');
    const RPC_URL = 'https://maculatus-rpc.x1eco.com/';
    
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(config.x1api.walletPrivateKey, provider);
    
    const balanceWei = await provider.getBalance(wallet.address);
    const balanceEther = ethers.formatEther(balanceWei);
    
    return { success: true, balance: balanceEther, address: wallet.address };
  } catch (error) {
    console.error('❌ Error getting balance:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getUserInfo,
  getQuests,
  completeQuest,
  claimFaucet,
  getDailyQuests,
  completeDailyQuests,
  getSocialQuests,
  completeSocialQuests,
  sendTransfer,
  getBalance,
  httpsAgent
};