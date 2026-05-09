const { ethers } = require('ethers');
const axios = require('axios');
const config = require('../config');
const { compileToken, calculateFee } = require('./tokenCompiler');

// ─── Constants ─────────────────────────────────────────────────────────────
const CONSTRUCTOR_API    = 'https://api-constructor.x1ecochain.com/api/v1';
const CONSTRUCTOR_ORIGIN = 'https://constructor.x1ecochain.com';
const RPC_URL            = 'https://maculatus-rpc.x1eco.com/';
const FACTORY_ADDRESS    = '0xd10f2f20188d110cdda02e95f6d91191db6edd4d';
const FEE_COLLECTOR      = '0x34264ec130f9aD5Fc9aa20aB95e42067b1304B5a';

const FACTORY_ABI = [
  'function sendAndDeploy(address to, uint256 amount, bytes creationCode) payable'
];

// ─── SIWE Auth for Constructor API ───────────────────────────────────────────
let constructorTokenCache = null;
let constructorTokenExpiry = 0;

async function getConstructorToken() {
  if (constructorTokenCache && Date.now() < constructorTokenExpiry) {
    return constructorTokenCache;
  }

  const wallet = new ethers.Wallet(config.x1api.walletPrivateKey);
  const H = {
    'Content-Type': 'application/json',
    'Origin': CONSTRUCTOR_ORIGIN,
    'Referer': CONSTRUCTOR_ORIGIN + '/'
  };

  const nonceRes = await axios.get(`${CONSTRUCTOR_API}/auth/nonce`, {
    params: { address: wallet.address },
    headers: H,
    timeout: 10000
  });
  const nonce = nonceRes.data.nonce;
  const issuedAt = new Date().toISOString();

  const siweMsg = [
    'constructor.x1ecochain.com wants you to sign in with your Ethereum account:',
    wallet.address,
    '',
    'Sign in to X1 Token Constructor',
    '',
    'URI: https://constructor.x1ecochain.com',
    'Version: 1',
    'Chain ID: 10778',
    'Nonce: ' + nonce,
    'Issued At: ' + issuedAt
  ].join('\n');

  const signature = await wallet.signMessage(siweMsg);

  const authRes = await axios.post(`${CONSTRUCTOR_API}/auth/verify`, {
    message: siweMsg,
    signature,
    address: wallet.address
  }, { headers: H, timeout: 10000 });

  constructorTokenCache = authRes.data.token;
  constructorTokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  console.log('✅ [Token] Constructor API auth OK (Phase 1)');
  return constructorTokenCache;
}

function constructorHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Origin': CONSTRUCTOR_ORIGIN,
    'Referer': CONSTRUCTOR_ORIGIN + '/',
    'Authorization': 'Bearer ' + token
  };
}

// ─── Phase 3: Register contract with Constructor API ─────────────────────────
async function registerContract(name, contractAddress, features = []) {
  try {
    const token = await getConstructorToken();
    const allFeatures = ['ERC20 Token', ...features].join(', ');

    const res = await axios.post(`${CONSTRUCTOR_API}/contracts`, {
      name,
      address: contractAddress,
      features: allFeatures
    }, { headers: constructorHeaders(token), timeout: 15000 });

    console.log(`✅ [Token] Registered: ${contractAddress} | features: "${allFeatures}" | ID: ${res.data.id}`);
    return { success: true, data: res.data };
  } catch (err) {
    const errMsg = err.response?.data?.error || err.message;
    console.error(`❌ [Token] Register failed (Phase 3): ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

// ─── Get list of created tokens ───────────────────────────────────────────────
async function getMyTokens() {
  try {
    const token = await getConstructorToken();
    const res = await axios.get(`${CONSTRUCTOR_API}/contracts/my`, {
      headers: constructorHeaders(token),
      timeout: 10000
    });
    return { success: true, tokens: res.data || [] };
  } catch (err) {
    return { success: false, error: err.message, tokens: [] };
  }
}

// ─── Phase 2: Deploy via official factory ────────────────────────────────────
async function deployViaFactory({ name, symbol, decimals, supply, features }) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(config.x1api.walletPrivateKey, provider);

  console.log(`\n🔨 [Token] Compiling ${name} (${symbol}) with solc...`);
  console.log(`   Features: ${features.length > 0 ? features.join(', ') : 'Basic ERC20 only'}`);

  // Compile Solidity source
  const { bytecode, abi } = compileToken({ name, symbol, decimals, supply, features });
  console.log(`   Bytecode: ${(bytecode.length - 2) / 2} bytes`);

  // Build constructor args (all = our wallet address)
  // Determine which constructor params exist based on features
  const hasAnyFeature = features.length > 0;
  const hasPausable   = features.includes('Pausable');
  const hasMintable   = features.includes('Mintable');
  const hasTaxable    = features.includes('Taxable');

  const ctorParamTypes = [
    'address',                       // recipient (always)
    hasAnyFeature ? 'address' : null, // defaultAdmin
    hasPausable   ? 'address' : null, // pauser
    hasMintable   ? 'address' : null, // minter
    hasTaxable    ? 'address' : null, // _taxWallet
  ].filter(Boolean);

  const ctorParamValues = ctorParamTypes.map(() => wallet.address);
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(ctorParamTypes, ctorParamValues);
  const creationCode = bytecode + encodedArgs.slice(2); // remove 0x from args

  // Calculate fee based on creation code size
  const feeX1T = calculateFee(creationCode);
  const feeWei = ethers.parseEther(feeX1T.toString());
  console.log(`   Fee: ${feeX1T} X1T | Creation code: ${(creationCode.length - 2) / 2} bytes`);

  // Check wallet balance
  const balanceWei = await provider.getBalance(wallet.address);
  const balance = parseFloat(ethers.formatEther(balanceWei));
  if (balance < Number(feeX1T) + 0.01) {
    throw new Error(`Saldo tidak cukup: ${balance.toFixed(4)} X1T (butuh min ${feeX1T} X1T untuk factory fee + gas)`);
  }

  // Call factory.sendAndDeploy(feeCollector, feeAmount, creationCode)
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);

  console.log(`⏳ [Token] Calling factory.sendAndDeploy...`);
  const tx = await factory.sendAndDeploy(FEE_COLLECTOR, feeWei, creationCode, {
    value: feeWei,
    gasLimit: 5000000
  });
  console.log(`⏳ [Token] Tx sent: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`✅ [Token] Factory tx confirmed. Gas used: ${receipt.gasUsed}`);

  // Find ContractDeployed event to get new contract address
  const deployedEvent = receipt.logs
    .map(log => {
      try {
        const iface = new ethers.Interface(['event ContractDeployed(address newContract)']);
        return iface.parseLog(log);
      } catch { return null; }
    })
    .find(e => e?.name === 'ContractDeployed');

  if (!deployedEvent) {
    throw new Error('ContractDeployed event not found in receipt');
  }

  const contractAddress = deployedEvent.args.newContract;
  console.log(`✅ [Token] Deployed at: ${contractAddress}`);

  return {
    address: contractAddress,
    txHash: receipt.hash,
    deployer: wallet.address,
    feeX1T: feeX1T.toString()
  };
}

// ─── Main: Full create token flow (Phase 1 → 2 → 3) ─────────────────────────
async function performCreateToken({ name, symbol, decimals = 18, supply, features = [] }) {
  const results = {
    name, symbol, decimals, supply, features,
    steps: []
  };

  try {
    console.log(`\n🚀 [Token] Starting: ${name} (${symbol})`);
    console.log(`   Features: ${features.length > 0 ? features.join(', ') : 'Basic ERC20'}`);

    // Phase 1: SIWE Auth (pre-auth so we fail fast before paying gas)
    await getConstructorToken();
    results.steps.push({ step: 'Phase 1: Auth ke Constructor API (SIWE)', success: true });

    // Phase 2: Compile + Deploy via factory
    const deployed = await deployViaFactory({ name, symbol, decimals, supply, features });
    results.steps.push({
      step: `Phase 2: Deploy ${symbol} via factory (${deployed.feeX1T} X1T fee)`,
      success: true,
      txHash: deployed.txHash
    });
    results.contractAddress = deployed.address;
    results.txHash = deployed.txHash;

    // Phase 3: Register with Constructor API
    const reg = await registerContract(name, deployed.address, features);
    results.steps.push({
      step: 'Phase 3: Register + Verify di Constructor API',
      success: reg.success,
      registrationId: reg.data?.id,
      error: reg.success ? undefined : reg.error
    });

    results.verified = reg.success;
    if (reg.success) results.registrationId = reg.data?.id;
    else results.registrationError = reg.error;

    results.success = true;
    results.explorerUrl    = `https://maculatus-scan.x1eco.com/address/${deployed.address}`;
    results.constructorUrl = `https://constructor.x1ecochain.com/ManageToken?contract=${deployed.address}`;

    console.log(`\n✅ [Token] Done! Address: ${deployed.address} | Verified: ${results.verified}`);
    return results;

  } catch (err) {
    console.error(`❌ [Token] Error: ${err.message}`);
    results.success = false;
    results.error = err.message;
    return results;
  }
}

module.exports = {
  performCreateToken,
  getMyTokens,
  getConstructorToken
};
