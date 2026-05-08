const { ethers } = require('ethers');
const axios = require('axios');
const config = require('../config');

// ─── Contract Addresses ───────────────────────────────────────────────────────
const NFT_POSITION_MANAGER = '0x4505eEA72B4D215284305d794CCAc618cd5eA531';
const SWAP_ROUTER           = '0x1BEC6C32bAA0881EA3f3Ec5e95d10EF8a252589B';
const POOL_ADDRESS          = '0xbe7fd2ff474c5f7edc9cda1e18cc1390f55c7ae0';
const WX1T_ADDRESS          = '0xe2ed17ae5e68863e77899205a83a8f1e138c608f';
const USDT_ADDRESS          = '0xd127BA1f0EfA2c5c7d9e6E7339DBafe2A6b1EAeC';
const RPC_URL               = 'https://maculatus-rpc.x1eco.com/';
const FEE_TIER              = 500;   // 0.05%
const TICK_LOWER            = -887270;
const TICK_UPPER            =  887270;
const SLIPPAGE_BPS          = 100;   // 1% slippage for liquidity ops

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
];

const WX1T_ABI = [
  'function deposit() external payable',
  'function withdraw(uint256 wad) external',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
];

const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountMinimOut, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

const NFT_PM_ABI = [
  // increaseLiquidity — add to existing position
  'function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)',
  // mint — create new position
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  // decreaseLiquidity — remove from existing position
  'function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)',
  // collect — collect fees/tokens after decrease
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)',
  // positions — query existing position
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
    console.log(`🔓 [Liq] Approving ${tokenAddress.slice(0, 10)}... to ${spender.slice(0, 10)}...`);
    const tx = await token.approve(spender, ethers.MaxUint256);
    await tx.wait();
    console.log(`✅ [Liq] Approval done`);
  }
}

// ─── Fetch current pool sqrtPriceX96 from chain ───────────────────────────────
async function getPoolSlot0(provider) {
  const pool = new ethers.Contract(POOL_ADDRESS, POOL_ABI, provider);
  const slot0 = await pool.slot0();
  return {
    sqrtPriceX96: slot0.sqrtPriceX96,
    tick: Number(slot0.tick)
  };
}

// ─── Fetch existing LP position from EcoDex API ───────────────────────────────
async function getExistingPosition(walletAddress) {
  try {
    const res = await axios.get(
      `https://api.ecodex.one/api/positions/${walletAddress}?refresh=1`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://ecodex.one',
          'Referer': 'https://ecodex.one/'
        },
        timeout: 10000
      }
    );
    const positions = res.data?.positions || [];
    // Find USDT/WX1T position in pool 0xbe7f...
    const pos = positions.find(p =>
      p.pool?.toLowerCase() === POOL_ADDRESS.toLowerCase() &&
      parseInt(p.nftTokenId) > 0
    );
    return pos || null;
  } catch (err) {
    console.warn(`⚠️  [Liq] Could not fetch positions: ${err.message}`);
    return null;
  }
}

// ─── Swap WX1T → USDT (small amount for ratio) ───────────────────────────────
async function swapWX1TtoUSDT(wallet, amountInWei, sqrtPriceX96) {
  const router = new ethers.Contract(SWAP_ROUTER, SWAP_ROUTER_ABI, wallet);
  const Q96 = BigInt(2) ** BigInt(96);
  const sqrtP = sqrtPriceX96;
  // token0=USDT, token1=WX1T → swapping token1→token0
  // amountOut(USDT) = amountIn(WX1T) / price = amountIn * Q96^2 / sqrtP^2
  const estimatedOut = amountInWei * (Q96 * Q96) / (sqrtP * sqrtP);
  const amountOutMin = applySlippage(estimatedOut);
  const deadline = Math.floor(Date.now() / 1000) + 600;

  await ensureApproval(wallet, WX1T_ADDRESS, SWAP_ROUTER, amountInWei);

  console.log(`🔄 [Liq] Swap ${ethers.formatEther(amountInWei)} WX1T → USDT (est: ${ethers.formatEther(estimatedOut)} USDT)`);
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
  console.log(`✅ [Liq] Swap WX1T→USDT tx: ${receipt.hash}`);
  return receipt.hash;
}

// ─── Main: Daily Add Liquidity ────────────────────────────────────────────────
// Strategy:
//  1. Wrap liquidityAmount X1T → WX1T
//  2. For full range pos: 50% value goes to each token → swap half WX1T → USDT
//  3. Approve both tokens to NonfungiblePositionManager
//  4. increaseLiquidity (existing) or mint (new full-range position)
async function performDailyLiquidity(liquidityAmountX1T) {
  const provider = getProvider();
  const wallet = getWallet(provider);

  console.log(`\n💧 [Liq] Starting daily add liquidity for ${liquidityAmountX1T} X1T`);
  console.log(`   Wallet: ${wallet.address}`);

  const results = {
    address: wallet.address,
    liquidityAmount: liquidityAmountX1T,
    steps: []
  };

  try {
    // ── Balance check ─────────────────────────────────────────────────────
    const balanceWei = await provider.getBalance(wallet.address);
    const balanceEth = parseFloat(ethers.formatEther(balanceWei));
    const amountNeeded = parseFloat(liquidityAmountX1T) + 0.02;
    console.log(`💰 [Liq] Balance: ${balanceEth.toFixed(4)} X1T, need: ${amountNeeded} X1T`);

    if (balanceEth < amountNeeded) {
      throw new Error(`Saldo tidak cukup: punya ${balanceEth.toFixed(4)} X1T, butuh ${amountNeeded} X1T`);
    }

    const totalWei = ethers.parseEther(liquidityAmountX1T.toString());
    const wx1t = new ethers.Contract(WX1T_ADDRESS, WX1T_ABI, wallet);
    const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, wallet);

    // ── Step 1: Wrap X1T → WX1T ──────────────────────────────────────────
    console.log(`\n📦 [Liq] Step 1: Wrapping ${liquidityAmountX1T} X1T → WX1T`);
    const wrapTx = await wx1t.deposit({ value: totalWei });
    const wrapReceipt = await wrapTx.wait();
    console.log(`✅ [Liq] Wrapped | tx: ${wrapReceipt.hash}`);
    results.steps.push({ step: 'Wrap X1T→WX1T', success: true, txHash: wrapReceipt.hash });

    // ── Step 2: Get pool price for ratio calculation ───────────────────────
    const slot0 = await getPoolSlot0(provider);
    const sqrtPriceX96 = slot0.sqrtPriceX96;
    console.log(`📊 [Liq] Pool tick: ${slot0.tick}, sqrtPrice: ${sqrtPriceX96.toString().slice(0, 12)}...`);

    // ── Step 3: Calculate token amounts needed ───────────────────────────
    // For full range, 50% value in WX1T, 50% value in USDT
    // Swap half the WX1T to USDT
    const halfWei = totalWei / 2n;
    const swapForUSDTWei = halfWei;

    // ── Step 4: Swap half WX1T → USDT ────────────────────────────────────
    console.log(`\n🔄 [Liq] Step 2: Swap ${ethers.formatEther(swapForUSDTWei)} WX1T → USDT`);
    const swapTxHash = await swapWX1TtoUSDT(wallet, swapForUSDTWei, sqrtPriceX96);
    results.steps.push({ step: 'Swap WX1T→USDT (ratio)', success: true, txHash: swapTxHash });

    // ── Step 5: Check final balances ──────────────────────────────────────
    const [wx1tBalWei, usdtBalWei] = await Promise.all([
      wx1t.balanceOf(wallet.address),
      usdt.balanceOf(wallet.address)
    ]);
    console.log(`💼 [Liq] WX1T: ${ethers.formatEther(wx1tBalWei)}, USDT: ${ethers.formatEther(usdtBalWei)}`);

    // ── Step 6: Approve both tokens to NonfungiblePositionManager ─────────
    console.log(`\n🔓 [Liq] Step 3: Approving tokens to NftPositionManager`);
    await ensureApproval(wallet, WX1T_ADDRESS, NFT_POSITION_MANAGER, wx1tBalWei);
    await ensureApproval(wallet, USDT_ADDRESS, NFT_POSITION_MANAGER, usdtBalWei);
    results.steps.push({ step: 'Approve tokens to PositionManager', success: true });

    const deadline = Math.floor(Date.now() / 1000) + 600;
    const amount0Min = applySlippage(usdtBalWei);
    const amount1Min = applySlippage(wx1tBalWei);

    // ── Step 7: increaseLiquidity or mint ────────────────────────────────
    const posManager = new ethers.Contract(NFT_POSITION_MANAGER, NFT_PM_ABI, wallet);
    const existingPos = await getExistingPosition(wallet.address);

    if (existingPos && existingPos.nftTokenId) {
      const nftTokenId = parseInt(existingPos.nftTokenId);
      console.log(`\n➕ [Liq] Step 4: increaseLiquidity on NFT #${nftTokenId}`);
      console.log(`   USDT: ${ethers.formatEther(usdtBalWei)}, WX1T: ${ethers.formatEther(wx1tBalWei)}`);

      const tx = await posManager.increaseLiquidity({
        tokenId: nftTokenId,
        amount0Desired: usdtBalWei,
        amount1Desired: wx1tBalWei,
        amount0Min,
        amount1Min,
        deadline
      });
      const receipt = await tx.wait();
      console.log(`✅ [Liq] IncreaseLiquidity tx: ${receipt.hash}`);
      results.steps.push({
        step: `Add to position NFT #${nftTokenId}`,
        success: true,
        txHash: receipt.hash
      });
      results.nftTokenId = nftTokenId;
      results.action = 'increase';
    } else {
      // No existing position → mint new full range position
      console.log(`\n🆕 [Liq] Step 4: Minting new full-range position`);
      console.log(`   USDT: ${ethers.formatEther(usdtBalWei)}, WX1T: ${ethers.formatEther(wx1tBalWei)}`);

      const tx = await posManager.mint({
        token0: USDT_ADDRESS,
        token1: WX1T_ADDRESS,
        fee: FEE_TIER,
        tickLower: TICK_LOWER,
        tickUpper: TICK_UPPER,
        amount0Desired: usdtBalWei,
        amount1Desired: wx1tBalWei,
        amount0Min,
        amount1Min,
        recipient: wallet.address,
        deadline
      });
      const receipt = await tx.wait();
      console.log(`✅ [Liq] Mint tx: ${receipt.hash}`);
      results.steps.push({ step: 'Mint new full-range position', success: true, txHash: receipt.hash });
      results.action = 'mint';
    }

    // ── Final balance ─────────────────────────────────────────────────────
    const finalBalance = await provider.getBalance(wallet.address);
    results.finalBalance = ethers.formatEther(finalBalance);
    results.success = true;
    results.message = `Daily add liquidity selesai! Saldo akhir: ${parseFloat(results.finalBalance).toFixed(4)} X1T`;

    console.log(`\n✅ [Liq] Done! Final balance: ${parseFloat(results.finalBalance).toFixed(4)} X1T`);
    return results;

  } catch (err) {
    console.error(`❌ [Liq] Error: ${err.message}`);
    results.success = false;
    results.error = err.message;
    return results;
  }
}

// ─── Get LP position info (for menu display) ──────────────────────────────────
async function getLiquidityInfo(walletAddress) {
  try {
    const provider = getProvider();
    const wallet = getWallet(provider);
    const address = walletAddress || wallet.address;

    const [position, slot0, x1tWei] = await Promise.all([
      getExistingPosition(address),
      getPoolSlot0(provider),
      provider.getBalance(address)
    ]);

    const Q96 = BigInt(2) ** BigInt(96);
    const sqrtP = slot0.sqrtPriceX96;
    // price of WX1T in USDT = (sqrtP/Q96)^2
    const priceWX1TinUSDT = Number(sqrtP * sqrtP) / Number(Q96 * Q96);

    return {
      success: true,
      hasPosition: !!position,
      position: position || null,
      nftTokenId: position?.nftTokenId || null,
      positionValueUSD: position?.metrics?.valueUSD || 0,
      positionStatus: position?.status || null,
      amountUSDT: position?.amounts?.token0 || 0,
      amountWX1T: position?.amounts?.token1 || 0,
      feesUSDT: position?.fees?.token0 || 0,
      feesWX1T: position?.fees?.token1 || 0,
      priceWX1TinUSDT: priceWX1TinUSDT.toFixed(6),
      aprPercent: ((position?.metrics?.apr || 0) * 100).toFixed(2),
      x1tBalance: ethers.formatEther(x1tWei)
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  performDailyLiquidity,
  getLiquidityInfo,
  NFT_POSITION_MANAGER,
  POOL_ADDRESS
};
