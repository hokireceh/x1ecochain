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
const ERC20_BYTECODE = '0x608060405234801561000f575f5ffd5b50604051610b91380380610b9183398101604081905261002e9161017b565b5f610039858261028d565b506001610046848261028d565b506002805460ff191660ff841690811790915561006490600a610444565b61006e9082610456565b6003819055600480546001600160a01b031916339081179091555f8181526005602052604080822084905551919290917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef916100cd9190815260200190565b60405180910390a35050505061046d565b634e487b7160e01b5f52604160045260245ffd5b5f82601f830112610101575f5ffd5b81516001600160401b0381111561011a5761011a6100de565b604051601f8201601f19908116603f011681016001600160401b0381118282101715610148576101486100de565b60405281815283820160200185101561015f575f5ffd5b8160208501602083015e5f918101602001919091529392505050565b5f5f5f5f6080858703121561018e575f5ffd5b84516001600160401b038111156101a3575f5ffd5b6101af878288016100f2565b602087015190955090506001600160401b038111156101cc575f5ffd5b6101d8878288016100f2565b935050604085015160ff811681146101ee575f5ffd5b6060959095015193969295505050565b600181811c9082168061021257607f821691505b60208210810361023057634e487b7160e01b5f52602260045260245ffd5b50919050565b601f821115610288578282111561028857805f5260205f20601f840160051c602085101561026157505f5b90810190601f840160051c035f5b81811015610284575f8382015560010161026f565b5050505b505050565b81516001600160401b038111156102a6576102a66100de565b6102ba816102b484546101fe565b84610236565b6020601f8211600181146102ec575f83156102d55750848201515b5f19600385901b1c1916600184901b178455610344565b5f84815260208120601f198516915b8281101561031b57878501518255602094850194600190920191016102fb565b508482101561033857868401515f19600387901b60f8161c191681555b505060018360011b0184555b5050505050565b634e487b7160e01b5f52601160045260245ffd5b6001815b600184111561039a5780850481111561037e5761037e61034b565b600184161561038c57908102905b60019390931c928002610363565b935093915050565b5f826103b05750600161043e565b816103bc57505f61043e565b81600181146103d257600281146103dc576103f8565b600191505061043e565b60ff8411156103ed576103ed61034b565b50506001821b61043e565b5060208310610133831016604e8410600b841016171561041b575081810a61043e565b6104275f19848461035f565b805f190482111561043a5761043a61034b565b0290505b92915050565b5f61044f83836103a2565b9392505050565b808202811582820484141761043e5761043e61034b565b6107178061047a5f395ff3fe608060405234801561000f575f5ffd5b506004361061009b575f3560e01c806370a082311161006357806370a08231146101295780638da5cb5b1461014857806395d89b4114610173578063a9059cbb1461017b578063dd62ed3e1461018e575f5ffd5b806306fdde031461009f578063095ea7b3146100bd57806318160ddd146100e057806323b872dd146100f7578063313ce5671461010a575b5f5ffd5b6100a76101b8565b6040516100b4919061056c565b60405180910390f35b6100d06100cb3660046105bc565b610243565b60405190151581526020016100b4565b6100e960035481565b6040519081526020016100b4565b6100d06101053660046105e4565b6102af565b6002546101179060ff1681565b60405160ff90911681526020016100b4565b6100e961013736600461061e565b60056020525f908152604090205481565b60045461015b906001600160a01b031681565b6040516001600160a01b0390911681526020016100b4565b6100a7610475565b6100d06101893660046105bc565b610482565b6100e961019c36600461063e565b600660209081525f928352604080842090915290825290205481565b5f80546101c49061066f565b80601f01602080910402602001604051908101604052809291908181526020018280546101f09061066f565b801561023b5780601f106102125761010080835404028352916020019161023b565b820191905f5260205f20905b81548152906001019060200180831161021e57829003601f168201915b505050505081565b335f8181526006602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9259061029d9086815260200190565b60405180910390a35060015b92915050565b6001600160a01b0383165f9081526005602052604081205482111561031b5760405162461bcd60e51b815260206004820152601b60248201527f45524332303a20696e73756666696369656e742062616c616e6365000000000060448201526064015b60405180910390fd5b6001600160a01b0384165f90815260066020908152604080832033845290915290205482111561038d5760405162461bcd60e51b815260206004820152601d60248201527f45524332303a20696e73756666696369656e7420616c6c6f77616e63650000006044820152606401610312565b6001600160a01b0384165f90815260056020526040812080548492906103b49084906106bb565b90915550506001600160a01b0383165f90815260056020526040812080548492906103e09084906106ce565b90915550506001600160a01b0384165f908152600660209081526040808320338452909152812080548492906104179084906106bb565b92505081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161046391815260200190565b60405180910390a35060019392505050565b600180546101c49061066f565b335f908152600560205260408120548211156104e05760405162461bcd60e51b815260206004820152601b60248201527f45524332303a20696e73756666696369656e742062616c616e636500000000006044820152606401610312565b335f90815260056020526040812080548492906104fe9084906106bb565b90915550506001600160a01b0383165f908152600560205260408120805484929061052a9084906106ce565b90915550506040518281526001600160a01b0384169033907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef9060200160405180910390a3506001919050565b602081525f82518060208401528060208501604085015e5f604082850101526040601f19601f83011684010191505092915050565b80356001600160a01b03811681146105b7575f5ffd5b919050565b5f5f604083850312156105cd575f5ffd5b6105d6836105a1565b946020939093013593505050565b5f5f5f606084860312156105f6575f5ffd5b6105ff846105a1565b925061060d602085016105a1565b929592945050506040919091013590565b5f6020828403121561062e575f5ffd5b610637826105a1565b9392505050565b5f5f6040838503121561064f575f5ffd5b610658836105a1565b9150610666602084016105a1565b90509250929050565b600181811c9082168061068357607f821691505b6020821081036106a157634e487b7160e01b5f52602260045260245ffd5b50919050565b634e487b7160e01b5f52601160045260245ffd5b818103818111156102a9576102a96106a7565b808201808211156102a9576102a96106a756fea26469706673582212204e19c7107a656a30893e27d1b45c0cafb202c052dca09f0f1c2f8b9fe802c59f64736f6c63430008230033';

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
