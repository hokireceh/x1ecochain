const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const TOKENS_FILE = path.join(__dirname, '../../tokens.json');
const API_BASE_URL = 'https://testnet-api.x1eco.com';

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('❌ Error loading tokens.json:', err.message);
  }
  return {};
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error('❌ Error saving tokens.json:', err.message);
  }
}

function isTokenExpired(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const expiresAt = payload.exp * 1000;
    const now = Date.now();
    
    return now >= expiresAt - 60000;
  } catch (err) {
    return true;
  }
}

async function generateSignature(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    
    // ✅ MESSAGE YANG BENAR (Sesuai log user - Address harus LOWERCASE)
    // Berdasarkan file: {"message":"X1 AuthMessage, Address 0xbe0bff0121f17ee0ec1f08976f936d714202face"}
    const message = `X1 AuthMessage, Address ${wallet.address.toLowerCase()}`;
    
    console.log('🔐 Signing with wallet:', wallet.address);
    console.log('📝 Message:', message);
    
    // ✅ Gunakan signMessage (Personal Sign)
    const signature = await wallet.signMessage(message);
    
    return { signature, message, address: wallet.address };
  } catch (err) {
    console.error('❌ Error generating signature:', err.message);
    throw err;
  }
}

async function generateToken(privateKey) {
  try {
    const { signature, address } = await generateSignature(privateKey);
    
    console.log('📤 Requesting token from API...');
    
    // ✅ 1. GET Handshake (Sesuai log user)
    try {
      await axios.get(`${API_BASE_URL}/signin`, {
        params: { address: address },
        headers: {
          'Origin': 'https://testnet.x1ecochain.com',
          'Referer': 'https://testnet.x1ecochain.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'sec-ch-ua': '"Brave";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site',
          'sec-gpc': '1'
        }
      });
      console.log('✅ GET /signin handshake successful');
    } catch (e) {
      console.warn('⚠️ GET /signin handshake info:', e.message);
    }
    
    // ✅ 2. POST Sign-in (Payload lengkap sesuai log user)
    const response = await axios.post(`${API_BASE_URL}/signin`, 
      { 
        signature,
        address: address,
        ref_code: "" 
      },
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Origin': 'https://testnet.x1ecochain.com',
          'Referer': 'https://testnet.x1ecochain.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Brave";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site',
          'sec-gpc': '1'
        } 
      }
    );
    
    if (response.data?.token) {
      console.log('✨ New token generated & saved to tokens.json');
      
      // Verify address from API response
      if (response.data.user?.address) {
        const apiAddress = response.data.user.address;
        if (apiAddress.toLowerCase() === address.toLowerCase()) {
          console.log('✅ Address verified:', apiAddress);
        } else {
          console.warn('⚠️  API returned different address:', apiAddress);
        }
      }
      
      const tokens = loadTokens();
      tokens.x1_auth_token = response.data.token;
      tokens.wallet_address = address;
      tokens.generated_at = new Date().toISOString();
      saveTokens(tokens);
      
      return response.data.token;
    }
    
    throw new Error('No token in response');
  } catch (err) {
    console.error('❌ Error generating token:', err.message);
    if (err.response?.data) {
      console.error('API Error:', JSON.stringify(err.response.data, null, 2));
    }
    throw err;
  }
}

async function getValidToken(privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  const expectedAddress = wallet.address;
  
  const tokens = loadTokens();
  const currentToken = tokens.x1_auth_token;
  const savedAddress = tokens.wallet_address;
  
  // Validate address matches
  if (savedAddress && savedAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
    console.log('⚠️  Cached token is for different address - regenerating...');
    return await generateToken(privateKey);
  }
  
  if (currentToken && !isTokenExpired(currentToken)) {
    console.log('✅ Token valid (cached)');
    return currentToken;
  }
  
  if (currentToken) {
    console.log('⏳ Token expired - generating new one...');
  } else {
    console.log('🔐 No token found - generating new one...');
  }
  
  return await generateToken(privateKey);
}

module.exports = {
  getValidToken,
  loadTokens,
  isTokenExpired
};
