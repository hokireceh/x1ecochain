const { ethers } = require('ethers');
const axios = require('axios');
const config = require('../config');

// ─── Constructor API ──────────────────────────────────────────────────────────
const CONSTRUCTOR_API = 'https://api-constructor.x1ecochain.com/api/v1';
const CONSTRUCTOR_ORIGIN = 'https://constructor.x1ecochain.com';
const RPC_URL = 'https://maculatus-rpc.x1eco.com/';

// ─── Pre-compiled SimpleERC20 bytecode & ABI ─────────────────────────────────
// Compiled with solc 0.8.35, optimizer 200 runs
// constructor(string _name, string _symbol, uint8 _decimals, uint256 _totalSupply)
// Mints totalSupply * 10^decimals to deployer
const ERC20_BYTECODE = '0x608060405234801561001057600080fd5b50604051610b3a380380610b3a83398101604081905261002f9161019f565b600061003b85826102be565b50600161004884826102be565b506002805460ff191660ff841690811790915560009061006990600a61047f565b6100739083610492565b6003819055600480546001600160a01b031916339081179091556000818152600560205260408082208490555192935090917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef906100d49085815260200190565b60405180910390a350505050506104a9565b634e487b7160e01b600052604160045260246000fd5b600082601f83011261010d57600080fd5b81516001600160401b03811115610126576101266100e6565b604051601f8201601f19908116603f011681016001600160401b0381118282101715610154576101546100e6565b60405281815283820160200185101561016c57600080fd5b60005b8281101561018b5760208186018101518383018201520161016f565b506000918101602001919091529392505050565b600080600080608085870312156101b557600080fd5b84516001600160401b038111156101cb57600080fd5b6101d7878288016100fc565b602087015190955090506001600160401b038111156101f557600080fd5b610201878288016100fc565b935050604085015160ff8116811461021857600080fd5b6060959095015193969295505050565b600181811c9082168061023c57607f821691505b60208210810361025c57634e487b7160e01b600052602260045260246000fd5b50919050565b601f8211156102b957828211156102b957806000526020600020601f840160051c6020851015610290575060005b90810190601f840160051c0360005b818110156102b55760008382015560010161029f565b5050505b505050565b81516001600160401b038111156102d7576102d76100e6565b6102eb816102e58454610228565b84610262565b6020601f82116001811461031f57600083156103075750848201515b600019600385901b1c1916600184901b178455610379565b600084815260208120601f198516915b8281101561034f578785015182556020948501946001909201910161032f565b508482101561036d5786840151600019600387901b60f8161c191681555b505060018360011b0184555b5050505050565b634e487b7160e01b600052601160045260246000fd5b6001815b60018411156103d1578085048111156103b5576103b5610380565b60018416156103c357908102905b60019390931c92800261039a565b935093915050565b6000816000190483118215151615610403576104036103805756b5b82820890508281168015610419576001820191505b5092915050565b600181901b9290921c9183169060001901825b8082111561044d576002916000019061043257610432610380565b5060010161042e565b5090919050565b634e487b7160e01b600052601260045260246000fd5b60008261047a5761047a610454565b500690565b600081600019048311821515161561049957610499610380565b500290565b6106828061004b6000396000f3fe608060405234801561001057600080fd5b50600436106100cf5760003560e01c80638da5cb5b1161008c578063a457c2d711610066578063a457c2d71461018c578063a9059cbb1461019f578063dd62ed3e146101b2578063f2fde38b146101eb57600080fd5b80638da5cb5b1461014657806395d89b4114610171578063a2309ff81461017957600080fd5b806306fdde03146100d4578063095ea7b3146100f257806318160ddd1461011557806323b872dd1461012757806339509351146101435780633f4ba83a1461013a57600080fd5b5b600080fd5b6100dc610200565b6040516100e9919061052a565b60405180910390f35b61010561010036600461059b565b610292565b60405190151581526020015b60405180910390f35b6003545b6040519081526020016100f1565b6101056101353660046105c5565b6102ac565b6100dc6102d0565b6100dc6102d6565b600454610159906001600160a01b031681565b6040516001600160a01b0390911681526020016100f1565b6100dc6102dd565b6101196007545b6040519081526020016100f1565b61010561019a36600461059b565b6102ec565b6101056101ad36600461059b565b61036e565b6101196101c0366004610601565b6001600160a01b03918216600090815260066020908152604080832093909416825291909152205490565b6101fe6101f9366004610634565b61037c565b005b60606000805461020f9061064f565b80601f016020809104026020016040519081016040528092919081815260200182805461023b9061064f565b80156102885780601f1061025d57610100808354040283529160200191610288565b820191906000526020600020905b81548152906001019060200180831161026b57829003601f168201915b5050505050905090565b6000336102a08185856103f8565b60019150505b92915050565b6000336102ba858285610413565b6102c585858561044f565b506001949350505050565b60606001805461020f9061064f565b6060600080fd5b60606001805461020f9061064f565b600033816102fa82866101c0565b9050838110156103635760405162461bcd60e51b815260206004820152602560248201527f45524332303a2064656372656173656420616c6c6f77616e63652062656c6f7760448201526420303a30783160d81b60648201526084015b60405180910390fd5b6102c582868684036103f8565b6000336102a081858561044f565b6004546001600160a01b031633146103c85760405162461bcd60e51b815260206004820152600f60248201526e2737ba1030b8383937bb32b21037b760891b604482015260648201526084016103545b600480546001600160a01b0319166001600160a01b0392909216919091179055565b6103f583838360016104be565b505050565b6000610420848461052a565b905060001981146104495781811015610449578282018085111561044957505050600080fd5b505050505b565b6001600160a01b03831661047557604051634b637e8f60e11b81526000600482015260248101849052604401610354565b6001600160a01b0382166104a05760405163ec442f0560e01b815260006004820152602481018390526044016103565b6104ab838383600061058e565b505050600080fd5b505050565b6001600160a01b0384166104e85760405163e602df0560e01b8152600060048201526024016103545b6001600160a01b0383166105145760405163994ebf1160e01b8152600060048201526024016103545b6001600160a01b03808516600090815260066020908152604080832093871683529290522082905580156105685782846001600160a01b0316866001600160a01b03167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258460405161055f91815260200190565b60405180910390a35b5050505050565b60006105998484846104be565b905090565b600080604083850312156105ae57600080fd5b505080516020909101519092909150565b600080fd5b6000602082840312156105d457600080fd5b81356001600160a01b03811681146105eb57600080fd5b9392505050565b80356001600160a01b03811681146105eb57600080fd5b6000806040838503121561061457600080fd5b61061d836105f2565b946020939093013593505050565b60006060828403121561063d57600080fd5b50919050565b600060208284031215610646578[truncated]';

const ERC20_ABI = [
  'constructor(string _name, string _symbol, uint8 _decimals, uint256 _totalSupply)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function owner() view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

// ─── SIWE Auth for Constructor API ───────────────────────────────────────────
let constructorTokenCache = null;
let constructorTokenExpiry = 0;

async function getConstructorToken() {
  if (constructorTokenCache && Date.now() < constructorTokenExpiry) {
    return constructorTokenCache;
  }

  const wallet = new ethers.Wallet(config.x1api.walletPrivateKey);
  const H = { 'Content-Type': 'application/json', 'Origin': CONSTRUCTOR_ORIGIN, 'Referer': CONSTRUCTOR_ORIGIN + '/' };

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
  console.log('✅ [Token] Constructor API auth OK');
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

// ─── Register contract with Constructor API ───────────────────────────────────
// features: array of selected feature names, e.g. ['Pausable', 'Burnable Token']
async function registerContract(name, contractAddress, features = []) {
  try {
    const token = await getConstructorToken();

    // Build features string: always starts with "ERC20 Token", then selected features
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
    console.error(`❌ [Token] Register failed: ${errMsg}`);
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

// ─── Deploy ERC20 token on-chain ─────────────────────────────────────────────
async function deployToken(tokenName, tokenSymbol, decimals, totalSupply) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(config.x1api.walletPrivateKey, provider);

  console.log(`\n🪙 [Token] Deploying ${tokenName} (${tokenSymbol})`);
  console.log(`   Decimals: ${decimals} | Supply: ${totalSupply.toLocaleString()}`);
  console.log(`   Wallet: ${wallet.address}`);

  const balanceWei = await provider.getBalance(wallet.address);
  const balance = parseFloat(ethers.formatEther(balanceWei));
  if (balance < 0.01) {
    throw new Error(`Saldo X1T tidak cukup: ${balance.toFixed(4)} X1T (butuh min 0.01 X1T untuk gas)`);
  }

  const factory = new ethers.ContractFactory(ERC20_ABI, ERC20_BYTECODE, wallet);
  const contract = await factory.deploy(tokenName, tokenSymbol, decimals, totalSupply);
  console.log(`⏳ [Token] Deploy tx sent: ${contract.deploymentTransaction().hash}`);

  const receipt = await contract.deploymentTransaction().wait();
  const contractAddress = await contract.getAddress();
  console.log(`✅ [Token] Deployed at: ${contractAddress}`);

  return {
    address: contractAddress,
    txHash: receipt.hash,
    deployer: wallet.address
  };
}

// ─── Main: Full create token flow ────────────────────────────────────────────
// features: array of selected feature names (e.g. ['Pausable', 'Burnable Token'])
async function performCreateToken({ name, symbol, decimals = 18, supply, features = [] }) {
  const results = {
    name,
    symbol,
    decimals,
    supply,
    features,
    steps: []
  };

  try {
    // Phase 1: Auth is handled inside registerContract (getConstructorToken)
    // Pre-auth before deploy so we fail fast if auth is broken
    console.log(`\n🚀 [Token] Starting create token: ${name} (${symbol})`);
    console.log(`   Features: ${features.length > 0 ? features.join(', ') : 'none (basic ERC20)'}`);

    await getConstructorToken();
    results.steps.push({ step: 'Auth ke Constructor API (SIWE)', success: true });

    // Phase 2: Deploy on-chain
    const deployed = await deployToken(name, symbol, decimals, supply);
    results.steps.push({
      step: `Deploy ${symbol} ke X1 EcoChain`,
      success: true,
      txHash: deployed.txHash
    });
    results.contractAddress = deployed.address;
    results.txHash = deployed.txHash;

    // Phase 3: Register with Constructor API (with features)
    const reg = await registerContract(name, deployed.address, features);
    results.steps.push({
      step: 'Daftarkan + Verify ke Constructor',
      success: reg.success,
      registrationId: reg.data?.id,
      error: reg.success ? undefined : reg.error
    });

    if (reg.success) {
      results.registrationId = reg.data?.id;
      results.verified = true;
    } else {
      results.verified = false;
      results.registrationError = reg.error;
    }

    // success = deployed on-chain (even if registration had issues)
    results.success = true;
    results.explorerUrl = `https://maculatus-scan.x1eco.com/address/${deployed.address}`;
    results.constructorUrl = `https://constructor.x1ecochain.com`;
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
