const { ethers } = require('ethers');
const config = require('../config');

const RPC_URL = 'https://maculatus-rpc.x1eco.com/';

const TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function paused() view returns (bool)',
  'function whitelistActive() view returns (bool)',
  'function taxWallet() view returns (address)',
  'function taxFeeBps() view returns (uint256)',
  'function pause() public',
  'function unpause() public',
  'function mint(address to, uint256 amount) public',
  'function burn(uint256 amount) public',
  'function setWhitelistActive(bool _active) public',
  'function setTaxWallet(address _newTaxWallet) external'
];

function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function getSigner() {
  return new ethers.Wallet(config.x1api.walletPrivateKey, getProvider());
}

// ─── Parse feature string from Constructor API ────────────────────────────────
function parseFeatures(featuresStr = '') {
  const f = featuresStr.toLowerCase();
  return {
    pausable:  f.includes('pausable'),
    burnable:  f.includes('burnable'),
    mintable:  f.includes('mintable'),
    whitelist: f.includes('whitelist'),
    taxable:   f.includes('taxable')
  };
}

// ─── Read token info on-chain ─────────────────────────────────────────────────
async function getTokenInfo(address) {
  try {
    const provider = getProvider();
    const contract = new ethers.Contract(address, TOKEN_ABI, provider);
    const wallet = config.x1api.walletAddress ||
      new ethers.Wallet(config.x1api.walletPrivateKey).address;

    const [name, symbol, decimals, totalSupply, balance] = await Promise.all([
      contract.name().catch(() => '?'),
      contract.symbol().catch(() => '?'),
      contract.decimals().catch(() => 18n),
      contract.totalSupply().catch(() => 0n),
      contract.balanceOf(wallet).catch(() => 0n)
    ]);

    const dec = Number(decimals);
    const supplyFormatted  = parseFloat(ethers.formatUnits(totalSupply, dec)).toLocaleString();
    const balanceFormatted = parseFloat(ethers.formatUnits(balance, dec)).toLocaleString();

    let paused = null;
    let whitelistActive = null;
    let taxWalletAddr = null;
    let taxFeeBps = null;

    try { paused = await contract.paused(); } catch (_) {}
    try { whitelistActive = await contract.whitelistActive(); } catch (_) {}
    try { taxWalletAddr = await contract.taxWallet(); } catch (_) {}
    try { taxFeeBps = await contract.taxFeeBps(); } catch (_) {}

    return {
      success: true,
      name, symbol, decimals: dec,
      totalSupply: supplyFormatted,
      balance: balanceFormatted,
      paused,
      whitelistActive,
      taxWallet: taxWalletAddr,
      taxFeeBps: taxFeeBps !== null ? Number(taxFeeBps) : null
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Pause / Unpause ──────────────────────────────────────────────────────────
async function pauseToken(address) {
  const signer = getSigner();
  const contract = new ethers.Contract(address, TOKEN_ABI, signer);
  const tx = await contract.pause({ gasLimit: 100000 });
  const receipt = await tx.wait();
  return { success: true, txHash: receipt.hash };
}

async function unpauseToken(address) {
  const signer = getSigner();
  const contract = new ethers.Contract(address, TOKEN_ABI, signer);
  const tx = await contract.unpause({ gasLimit: 100000 });
  const receipt = await tx.wait();
  return { success: true, txHash: receipt.hash };
}

// ─── Mint ─────────────────────────────────────────────────────────────────────
async function mintTokens(address, toAddress, amountUnits, decimals = 18) {
  const signer = getSigner();
  const contract = new ethers.Contract(address, TOKEN_ABI, signer);
  const amountWei = ethers.parseUnits(String(amountUnits), decimals);
  const tx = await contract.mint(toAddress, amountWei, { gasLimit: 200000 });
  const receipt = await tx.wait();
  return { success: true, txHash: receipt.hash };
}

// ─── Burn ─────────────────────────────────────────────────────────────────────
async function burnTokens(address, amountUnits, decimals = 18) {
  const signer = getSigner();
  const contract = new ethers.Contract(address, TOKEN_ABI, signer);
  const amountWei = ethers.parseUnits(String(amountUnits), decimals);
  const tx = await contract.burn(amountWei, { gasLimit: 200000 });
  const receipt = await tx.wait();
  return { success: true, txHash: receipt.hash };
}

// ─── Whitelist toggle ─────────────────────────────────────────────────────────
async function setWhitelist(address, active) {
  const signer = getSigner();
  const contract = new ethers.Contract(address, TOKEN_ABI, signer);
  const tx = await contract.setWhitelistActive(active, { gasLimit: 100000 });
  const receipt = await tx.wait();
  return { success: true, txHash: receipt.hash };
}

// ─── Set Tax Wallet ───────────────────────────────────────────────────────────
async function setTaxWallet(address, newWallet) {
  const signer = getSigner();
  const contract = new ethers.Contract(address, TOKEN_ABI, signer);
  const tx = await contract.setTaxWallet(newWallet, { gasLimit: 100000 });
  const receipt = await tx.wait();
  return { success: true, txHash: receipt.hash };
}

module.exports = {
  parseFeatures,
  getTokenInfo,
  pauseToken,
  unpauseToken,
  mintTokens,
  burnTokens,
  setWhitelist,
  setTaxWallet
};
