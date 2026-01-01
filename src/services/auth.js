const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const TOKENS_FILE = path.join(__dirname, '../../tokens.json');
const API_BASE_URL = 'https://testnet-api.x1.one';

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
    
    // ✅ MESSAGE YANG BENAR (sesuai dengan yang di-sign di browser)
    const message = 'X1 Testnet Auth';
    
    console.log('🔐 Signing with wallet:', wallet.address);
    
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
    
    const response = await axios.post(`${API_BASE_URL}/signin`, 
      { signature },
      { headers: { 'Content-Type': 'application/json' } }
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