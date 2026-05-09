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
const ERC20_BYTECODE = '0x608060405234801561001057600080fd5b50604051610b3a380380610b3a83398101604081905261002f9161019f565b600061003b85826102be565b50600161004884826102be565b506002805460ff191660ff841690811790915560009061006990600a61047f565b6100739083610492565b6003819055600480546001600160a01b031916339081179091556000818152600560205260408082208490555192935090917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef906100d49085815260200190565b60405180910390a350505050506104a9565b634e487b7160e01b600052604160045260246000fd5b600082601f83011261010d57600080fd5b81516001600160401b03811115610126576101266100e6565b604051601f8201601f19908116603f011681016001600160401b0381118282101715610154576101546100e6565b60405281815283820160200185101561016c57600080fd5b60005b8281101561018b5760208186018101518383018201520161016f565b506000918101602001919091529392505050565b600080600080608085870312156101b557600080fd5b84516001600160401b038111156101cb57600080fd5b6101d7878288016100fc565b602087015190955090506001600160401b038111156101f557600080fd5b610201878288016100fc565b935050604085015160ff8116811461021857600080fd5b6060959095015193969295505050565b600181811c9082168061023c57607f821691505b60208210810361025c57634e487b7160e01b600052602260045260246000fd5b50919050565b601f8211156102b957828211156102b957806000526020600020601f840160051c6020851015610290575060005b90810190601f840160051c0360005b818110156102b55760008382015560010161029f565b5050505b505050565b81516001600160401b038111156102d7576102d76100e6565b6102eb816102e58454610228565b84610262565b6020601f82116001811461031f57600083156103075750848201515b600019600385901b1c1916600184901b178455610379565b600084815260208120601f198516915b8281101561034f578785015182556020948501946001909201910161032f565b508482101561036d5786840151600019600387901b60f8161c191681555b505060018360011b0184555b5050505050565b634e487b7160e01b600052601160045260246000fd5b6001815b60018411156103d1578085048111156103b5576103b5610380565b60018416156103c357908102905b60019390931c92800261039a565b935093915050565b6000826103e857506001610479565b816103f557506000610479565b816001811461040b576002811461041557610431565b6001915050610479565b60ff84111561042657610426610380565b50506001821b610479565b5060208310610133831016604e8410600b8410161715610454575081810a610479565b6104616000198484610396565b806000190482111561047557610475610380565b0290505b92915050565b600061048b83836103d9565b9392505050565b808202811582820484141761047957610479610380565b610682806104b86000396000f3fe608060405234801561001057600080fd5b506004361061009e5760003560e01c806370a082311161006657806370a082311461012d5780638da5cb5b1461014d57806395d89b4114610178578063a9059cbb14610180578063dd62ed3e1461019357600080fd5b806306fdde03146100a3578063095ea7b3146100c157806318160ddd146100e457806323b872dd146100fb578063313ce5671461010e575b600080fd5b6100ab6101be565b6040516100b891906104b0565b60405180910390f35b6100d46100cf36600461051a565b61024c565b60405190151581526020016100b8565b6100ed60035481565b6040519081526020016100b8565b6100d4610109366004610544565b6102b9565b60025461011b9060ff1681565b60405160ff90911681526020016100b8565b6100ed61013b366004610581565b60056020526000908152604090205481565b600454610160906001600160a01b031681565b6040516001600160a01b0390911681526020016100b8565b6100ab6103f9565b6100d461018e36600461051a565b610406565b6100ed6101a13660046105a3565b600660209081526000928352604080842090915290825290205481565b600080546101cb906105d6565b80601f01602080910402602001604051908101604052809291908181526020018280546101f7906105d6565b80156102445780601f1061021957610100808354040283529160200191610244565b820191906000526020600020905b81548152906001019060200180831161022757829003601f168201915b505050505081565b3360008181526006602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925906102a79086815260200190565b60405180910390a35060015b92915050565b6001600160a01b0383166000908152600560205260408120548211156102de57600080fd5b6001600160a01b038416600090815260066020908152604080832033845290915290205482111561030e57600080fd5b6001600160a01b038416600090815260066020908152604080832033845290915281208054849290610341908490610626565b90915550506001600160a01b0384166000908152600560205260408120805484929061036e908490610626565b90915550506001600160a01b0383166000908152600560205260408120805484929061039b908490610639565b92505081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516103e791815260200190565b60405180910390a35060019392505050565b600180546101cb906105d6565b3360009081526005602052604081205482111561042257600080fd5b3360009081526005602052604081208054849290610441908490610626565b90915550506001600160a01b0383166000908152600560205260408120805484929061046e908490610639565b90915550506040518281526001600160a01b0384169033907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef906020016102a7565b602081526000825180602084015260005b818110156104de57602081860181015160408684010152016104c1565b506000604082850101526040601f19601f83011684010191505092915050565b80356001600160a01b038116811461051557600080fd5b919050565b6000806040838503121561052d57600080fd5b610536836104fe565b946020939093013593505050565b60008060006060848603121561055957600080fd5b610562846104fe565b9250610570602085016104fe565b929592945050506040919091013590565b60006020828403121561059357600080fd5b61059c826104fe565b9392505050565b600080604083850312156105b657600080fd5b6105bf836104fe565b91506105cd602084016104fe565b90509250929050565b600181811c908216806105ea57607f821691505b60208210810361060a57634e487b7160e01b600052602260045260246000fd5b50919050565b634e487b7160e01b600052601160045260246000fd5b818103818111156102b3576102b3610610565b808201808211156102b3576102b361061056fea2646970667358221220200ec7b1b639cf8480f481bdb08c81be3a953afd35a98d2a4b215bf3e4ee72d664736f6c63430008230033';

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
  constructorTokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 jam
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
async function registerContract(name, contractAddress) {
  try {
    const token = await getConstructorToken();
    const res = await axios.post(`${CONSTRUCTOR_API}/contracts`, {
      name,
      address: contractAddress
    }, { headers: constructorHeaders(token), timeout: 10000 });
    console.log(`✅ [Token] Registered contract: ${contractAddress} → ID ${res.data.id}`);
    return { success: true, data: res.data };
  } catch (err) {
    console.warn(`⚠️  [Token] Register failed (non-critical): ${err.response?.data?.error || err.message}`);
    return { success: false, error: err.message };
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
async function performCreateToken({ name, symbol, decimals = 18, supply }) {
  const results = {
    name,
    symbol,
    decimals,
    supply,
    steps: []
  };

  try {
    // 1. Deploy on-chain
    console.log(`\n🚀 [Token] Starting create token: ${name} (${symbol})`);
    const deployed = await deployToken(name, symbol, decimals, supply);
    results.steps.push({
      step: `Deploy ${symbol} ke X1 EcoChain`,
      success: true,
      txHash: deployed.txHash
    });
    results.contractAddress = deployed.address;
    results.txHash = deployed.txHash;

    // 2. Register with Constructor API
    const reg = await registerContract(name, deployed.address);
    results.steps.push({
      step: 'Daftarkan ke Constructor',
      success: reg.success,
      registrationId: reg.data?.id
    });
    if (reg.success) results.registrationId = reg.data?.id;

    results.success = true;
    results.explorerUrl = `https://maculatus-scan.x1eco.com/address/${deployed.address}`;
    results.constructorUrl = `https://constructor.x1ecochain.com`;
    console.log(`\n✅ [Token] Done! Address: ${deployed.address}`);
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
