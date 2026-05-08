const { ethers } = require('ethers');
const config = require('../config');

// ─── Contract Addresses (X1 EcoChain Testnet) ────────────────────────────────
const SWAP_ROUTER   = '0x1BEC6C32bAA0881EA3f3Ec5e95d10EF8a252589B';
const WX1T_ADDRESS  = '0xe2ed17ae5e68863e77899205a83a8f1e138c608f';
const USDT_ADDRESS  = '0xd127BA1f0EfA2c5c7d9e6E7339DBafe2A6b1EAeC';
const RPC_URL       = 'https://maculatus-rpc.x1eco.com/';
const FEE_TIER      = 500; // 0.05%
const SLIPPAGE_BPS  = 50;  // 0.5% slippage tolerance

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountMinimOut, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function unwrapWETH9(uint256 amountMinimum, address recipient) external payable',
  'function refundETH() external payable',
  'function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)'
];

const WX1T_ABI = [
  'function deposit() external payable',
  'function withdraw(uint256 wad) external',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

function getWallet(provider) {
  return new ethers.Wallet(config.x1api.walletPrivateKey, provider);
}

function applySlippage(amount, bps = SLIPPAGE_BPS) {
  return amount * BigInt(10000 - bps) / BigInt(10000);
}

async function ensureApproval(wallet, tokenAddress, spender, amountNeeded) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const current = await token.allowance(wallet.address, spender);
  if (current < amountNeeded) {
    console.log(`🔓 [Swap] Approving ${tokenAddress.slice(0, 10)}... to router`);
    const tx = await token.approve(spender, ethers.MaxUint256);
    await tx.wait();
    console.log(`✅ [Swap] Approval confirmed`);
  }
}

// ─── Get quote from pool API ──────────────────────────────────────────────────
async function getPoolInfo() {
  const axios = require('axios');
  const response = await axios.post('https://api.ecodex.one/api/swap/pool', {
    tokenA: WX1T_ADDRESS,
    tokenB: USDT_ADDRESS
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://ecodex.one',
      'Referer': 'https://ecodex.one/'
    }
  });
  return response.data;
}

// ─── Calculate price from sqrtPriceX96 ───────────────────────────────────────
function calcPriceFromSqrt(sqrtPriceX96Str, token0IsUSDT = true) {
  const sqrtPriceX96 = BigInt(sqrtPriceX96Str);
  const Q96 = BigInt(2) ** BigInt(96);
  // price = (sqrtPriceX96 / Q96)^2
  // token0 = USDT, token1 = WX1T
  // price in USDT per WX1T = (sqrtP/Q96)^2
  const price = Number(sqrtPriceX96 * sqrtPriceX96) / Number(Q96 * Q96);
  return token0IsUSDT ? price : 1 / price;
}

// ─── Swap WX1T → USDT ────────────────────────────────────────────────────────
async function swapWX1TtoUSDT(wallet, amountInWei, poolInfo) {
  const router = new ethers.Contract(SWAP_ROUTER, SWAP_ROUTER_ABI, wallet);

  // token0=USDT, token1=WX1T
  // Swapping token1→token0: amountOut(USDT) = amountIn(WX1T) / price
  // price = (sqrtP/Q96)^2  →  amountOut = amountIn * Q96^2 / sqrtP^2
  const sqrtPrice = BigInt(poolInfo.sqrtPrice);
  const Q96 = BigInt(2) ** BigInt(96);
  const estimatedOut = amountInWei * (Q96 * Q96) / (sqrtPrice * sqrtPrice);
  const amountOutMin = applySlippage(estimatedOut);

  const deadline = Math.floor(Date.now() / 1000) + 600; // 10 min

  await ensureApproval(wallet, WX1T_ADDRESS, SWAP_ROUTER, amountInWei);

  console.log(`🔄 [Swap] WX1T → USDT | amount: ${ethers.formatEther(amountInWei)} WX1T`);
  console.log(`   estimated out: ${ethers.formatEther(estimatedOut)} USDT | min: ${ethers.formatEther(amountOutMin)} USDT`);

  const tx = await router.exactInputSingle({
    tokenIn: WX1T_ADDRESS,
    tokenOut: USDT_ADDRESS,
    fee: FEE_TIER,
    recipient: wallet.address,
    deadline,
    amountIn: amountInWei,
    amountMinimOut: amountOutMin,
    sqrtPriceLimitX96: 0n
  });

  const receipt = await tx.wait();
  console.log(`✅ [Swap] WX1T→USDT tx: ${receipt.hash}`);
  return { success: true, txHash: receipt.hash, amountIn: amountInWei, estimatedOut };
}

// ─── Swap USDT → WX1T ────────────────────────────────────────────────────────
async function swapUSDTtoWX1T(wallet, amountInWei, poolInfo) {
  const router = new ethers.Contract(SWAP_ROUTER, SWAP_ROUTER_ABI, wallet);

  // token0=USDT, token1=WX1T
  // Swapping token0→token1: amountOut(WX1T) = amountIn(USDT) * price
  // price = (sqrtP/Q96)^2  →  amountOut = amountIn * sqrtP^2 / Q96^2
  const sqrtPrice = BigInt(poolInfo.sqrtPrice);
  const Q96 = BigInt(2) ** BigInt(96);
  const estimatedOut = amountInWei * (sqrtPrice * sqrtPrice) / (Q96 * Q96);
  const amountOutMin = applySlippage(estimatedOut);

  const deadline = Math.floor(Date.now() / 1000) + 600;

  await ensureApproval(wallet, USDT_ADDRESS, SWAP_ROUTER, amountInWei);

  console.log(`🔄 [Swap] USDT → WX1T | amount: ${ethers.formatEther(amountInWei)} USDT`);
  console.log(`   estimated out: ${ethers.formatEther(estimatedOut)} WX1T | min: ${ethers.formatEther(amountOutMin)} WX1T`);

  const tx = await router.exactInputSingle({
    tokenIn: USDT_ADDRESS,
    tokenOut: WX1T_ADDRESS,
    fee: FEE_TIER,
    recipient: wallet.address,
    deadline,
    amountIn: amountInWei,
    amountMinimOut: amountOutMin,
    sqrtPriceLimitX96: 0n
  });

  const receipt = await tx.wait();
  console.log(`✅ [Swap] USDT→WX1T tx: ${receipt.hash}`);
  return { success: true, txHash: receipt.hash, amountIn: amountInWei, estimatedOut };
}

// ─── Main: Daily Swap (X1T → WX1T → USDT → WX1T → X1T) ─────────────────────
async function performDailySwap(swapAmountX1T) {
  const provider = getProvider();
  const wallet = getWallet(provider);

  console.log(`\n💱 [Swap] Starting daily swap for ${swapAmountX1T} X1T`);
  console.log(`   Wallet: ${wallet.address}`);

  const results = {
    address: wallet.address,
    swapAmount: swapAmountX1T,
    steps: []
  };

  try {
    // Check balance
    const balanceWei = await provider.getBalance(wallet.address);
    const balanceEth = parseFloat(ethers.formatEther(balanceWei));
    console.log(`💰 [Swap] Balance: ${balanceEth.toFixed(4)} X1T`);

    const amountX1T = parseFloat(swapAmountX1T);
    if (balanceEth < amountX1T + 0.01) {
      throw new Error(`Insufficient balance: have ${balanceEth.toFixed(4)} X1T, need ${amountX1T + 0.01} X1T`);
    }

    const amountWei = ethers.parseEther(swapAmountX1T.toString());
    const wx1t = new ethers.Contract(WX1T_ADDRESS, WX1T_ABI, wallet);

    // ── Step 1: Wrap X1T → WX1T ──────────────────────────────────────────
    console.log(`\n📦 [Swap] Step 1: Wrapping ${swapAmountX1T} X1T → WX1T`);
    const wrapTx = await wx1t.deposit({ value: amountWei });
    const wrapReceipt = await wrapTx.wait();
    console.log(`✅ [Swap] Wrapped | tx: ${wrapReceipt.hash}`);
    results.steps.push({ step: 'Wrap X1T→WX1T', success: true, txHash: wrapReceipt.hash });

    // Get pool info for price calculation
    const poolInfo = await getPoolInfo();

    // ── Step 2: Swap WX1T → USDT ─────────────────────────────────────────
    console.log(`\n🔄 [Swap] Step 2: Swap WX1T → USDT`);
    const swap1 = await swapWX1TtoUSDT(wallet, amountWei, poolInfo);
    results.steps.push({ step: 'Swap WX1T→USDT', success: true, txHash: swap1.txHash });

    // ── Step 3: Check USDT balance received ──────────────────────────────
    const usdtToken = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, wallet);
    const usdtBalance = await usdtToken.balanceOf(wallet.address);
    console.log(`💵 [Swap] USDT balance: ${ethers.formatEther(usdtBalance)} USDT`);

    // ── Step 4: Swap USDT → WX1T ─────────────────────────────────────────
    console.log(`\n🔄 [Swap] Step 3: Swap USDT → WX1T`);
    // Refresh pool info for updated price
    const poolInfo2 = await getPoolInfo();
    const swap2 = await swapUSDTtoWX1T(wallet, usdtBalance, poolInfo2);
    results.steps.push({ step: 'Swap USDT→WX1T', success: true, txHash: swap2.txHash });

    // ── Step 5: Unwrap WX1T → X1T ────────────────────────────────────────
    console.log(`\n📦 [Swap] Step 4: Unwrapping WX1T → X1T`);
    const wx1tBalance = await wx1t.balanceOf(wallet.address);
    console.log(`   WX1T to unwrap: ${ethers.formatEther(wx1tBalance)} WX1T`);
    const unwrapTx = await wx1t.withdraw(wx1tBalance);
    const unwrapReceipt = await unwrapTx.wait();
    console.log(`✅ [Swap] Unwrapped | tx: ${unwrapReceipt.hash}`);
    results.steps.push({ step: 'Unwrap WX1T→X1T', success: true, txHash: unwrapReceipt.hash });

    // ── Final balance ─────────────────────────────────────────────────────
    const finalBalance = await provider.getBalance(wallet.address);
    results.finalBalance = ethers.formatEther(finalBalance);
    results.success = true;
    results.message = `Daily swap completed! Final balance: ${parseFloat(results.finalBalance).toFixed(4)} X1T`;

    console.log(`\n✅ [Swap] Daily swap complete! Final balance: ${parseFloat(results.finalBalance).toFixed(4)} X1T`);
    return results;

  } catch (err) {
    console.error(`❌ [Swap] Error: ${err.message}`);
    results.success = false;
    results.error = err.message;
    results.steps.push({ step: 'Error', success: false, error: err.message });
    return results;
  }
}

// ─── Get token balances ───────────────────────────────────────────────────────
async function getSwapBalances() {
  try {
    const provider = getProvider();
    const wallet = getWallet(provider);

    const wx1t = new ethers.Contract(WX1T_ADDRESS, ERC20_ABI, provider);
    const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);

    const [x1tWei, wx1tWei, usdtWei, poolInfo] = await Promise.all([
      provider.getBalance(wallet.address),
      wx1t.balanceOf(wallet.address),
      usdt.balanceOf(wallet.address),
      getPoolInfo().catch(() => null)
    ]);

    let price = null;
    if (poolInfo?.sqrtPrice) {
      const sqrtPrice = BigInt(poolInfo.sqrtPrice);
      const Q96 = BigInt(2) ** BigInt(96);
      price = Number(sqrtPrice * sqrtPrice) / Number(Q96 * Q96);
    }

    return {
      success: true,
      x1t: ethers.formatEther(x1tWei),
      wx1t: ethers.formatEther(wx1tWei),
      usdt: ethers.formatEther(usdtWei),
      priceWX1TinUSDT: price ? price.toFixed(6) : 'N/A'
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  performDailySwap,
  getSwapBalances,
  WX1T_ADDRESS,
  USDT_ADDRESS,
  SWAP_ROUTER
};
