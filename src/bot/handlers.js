const api = require('../services/api');
const keyboards = require('./keyboards');
const config = require('../config');
const scheduler = require('../services/scheduler');
const swap = require('../services/swap');
const liquidity = require('../services/liquidity');
const tokenCreator = require('../services/tokenCreator');

// ─── Conversation State for Token Creation ────────────────────────────────────
const tokenSessions = new Map();

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeErr(msg) {
  if (!msg) return 'Unknown error';
  const revertMatch = msg.match(/reason="([^"]+)"/);
  if (revertMatch) return esc(revertMatch[1]);
  const short = msg.split('\n')[0];
  return esc(short.length > 200 ? short.slice(0, 200) + '...' : short);
}

function isAllowed(userId) {
  if (config.telegram.allowedUsers.length === 0) return true;
  return config.telegram.allowedUsers.includes(userId);
}

// ─── Format helpers (HTML) ────────────────────────────────────────────────────
function formatProfile(data, balanceData) {
  let text = `👤 <b>Your Profile</b>\n\n`;
  text += `💼 <b>Wallet:</b> <code>${esc(data.address.slice(0, 6))}...${esc(data.address.slice(-4))}</code>\n`;
  text += `💰 <b>Balance:</b> ${balanceData.success ? parseFloat(balanceData.balance).toFixed(4) : 'Error'} X1T\n`;
  text += `⭐ <b>Points:</b> ${data.points}\n`;
  text += `🏆 <b>Rank:</b> #${data.rank}\n`;

  if (data.linked_accounts && data.linked_accounts.length > 0) {
    text += `\n🔗 <b>Linked Accounts:</b>\n`;
    data.linked_accounts.forEach(acc => {
      const icon = acc.accountType === 'x' ? '𝕏' : acc.accountType === 'discord' ? '💬' : '🔗';
      text += `${icon} ${esc(acc.accountType.toUpperCase())}: @${esc(acc.accountUserName)}\n`;
    });
  }

  text += `\n📅 Updated: ${esc(new Date(data.updated_at).toLocaleDateString())}`;
  return text;
}

function formatQuests(quests) {
  if (quests.length === 0) return '📋 No quests available.';

  let text = '📋 <b>Available Quests</b>\n\n';
  let completedCount = 0;

  quests.forEach((q) => {
    const status = q.is_completed_today ? '✅' : (q.is_completed ? '☑️' : '⏳');
    const period = q.periodicity === 'daily' ? '🔄' : (q.periodicity === 'one_time' ? '1️⃣' : '📅');
    if (q.is_completed_today) completedCount++;
    const categoryIcon = q.category === 'social' ? '🌐' : (q.category === 'onchain' ? '⛓️' : '📌');

    text += `${status} <b>${esc(q.title)}</b>\n`;
    text += `   ${categoryIcon} ${esc(q.category)} | ${period} ${esc(q.periodicity)}\n`;
    text += `   💰 ${q.reward} pts | Completed: ${q.total_completions}\n\n`;
  });

  text += `<b>Progress: ${completedCount}/${quests.length} completed today</b>`;
  return text.trim();
}

function formatDailyQuests(quests) {
  if (quests.length === 0) return '🎯 No daily quests available.';

  let text = '🎯 <b>Daily Quests Today</b>\n\n';
  let completedCount = 0;

  quests.forEach((q) => {
    const status = q.is_completed_today ? '✅ Done' : '⏳ Pending';
    if (q.is_completed_today) completedCount++;

    text += `${status} <b>${esc(q.title)}</b>\n`;
    text += `   💰 ${q.reward} pts\n`;
    if (q.call_to_action && q.call_to_action !== 'faucet' && q.call_to_action !== 'transfer') {
      text += `   🔗 ${esc(q.call_to_action.slice(0, 40))}\n`;
    }
    text += '\n';
  });

  text += `<b>Completed: ${completedCount}/${quests.length}</b>`;
  return text.trim();
}

function formatAutoResults(results) {
  let text = '🚀 <b>Auto Complete Results</b>\n\n';
  let totalRewards = 0;
  let successCount = 0;
  let failCount = 0;

  results.forEach(r => {
    if (r.skipped) {
      text += `☑️ <b>${esc(r.title)}</b>\n   Already completed\n\n`;
    } else if (r.success) {
      text += `✅ <b>${esc(r.title)}</b>\n   +${r.reward} pts earned!\n\n`;
      totalRewards += r.reward;
      successCount++;
    } else {
      text += `❌ <b>${esc(r.title)}</b>\n   ${esc(r.error || 'Failed')}\n\n`;
      failCount++;
    }
  });

  text += `<b>Summary: ${successCount} ✅ | ${failCount} ❌</b>\n`;
  text += `💰 <b>Total Earned:</b> ${totalRewards} pts`;
  return text.trim();
}

function formatFaucetResponse(data) {
  if (!data) return '❌ No response from faucet';

  let text = `💧 <b>Faucet Claimed!</b>\n\n`;
  if (data.message) text += `✅ ${esc(data.message)}\n`;
  if (data.amount) text += `💰 Amount: ${esc(String(data.amount))}\n`;
  if (data.tx_hash) text += `📝 TX: <code>${esc(data.tx_hash.slice(0, 10))}...</code>\n`;
  if (data.next_claim) text += `⏰ Next claim: ${esc(new Date(data.next_claim).toLocaleString())}\n`;

  return text;
}

function formatDCFaucetCommand() {
  const address = global.walletAddress || '';
  return `🔗 <b>Discord Faucet Command</b>\n\n` +
    `<b>1. Open Faucet Channel:</b>\n` +
    `https://discord.com/channels/1338212210987765830/1414784870495948912\n\n` +
    `<b>2. Copy this command to Discord:</b>\n\n` +
    `<pre>/faucet address: ${esc(address)}</pre>\n\n` +
    `<b>3. Paste and send!</b>`;
}

const HTML = { parse_mode: 'HTML' };

// ─── Handlers ─────────────────────────────────────────────────────────────────
async function handleStart(ctx) {
  const userId = ctx.from.id;
  if (!isAllowed(userId)) return ctx.reply('⛔ You are not authorized to use this bot.');

  await ctx.reply(
    `🤖 <b>X1 EcoChain Bot</b>\n\nWelcome! Use the menu below to manage your X1 EcoChain quests and faucet.\n\nSelect an option:`,
    { ...HTML, ...keyboards.mainMenu }
  );
}

async function handleCallback(ctx) {
  const userId = ctx.from.id;
  const action = ctx.callbackQuery.data;

  if (!isAllowed(userId)) return ctx.answerCbQuery('Not authorized', { show_alert: true });
  await ctx.answerCbQuery();

  switch (action) {
    case 'menu':
      await ctx.editMessageText(`🤖 <b>X1 EcoChain Bot</b>\n\nSelect an option:`, {
        ...HTML, ...keyboards.mainMenu
      });
      break;

    case 'refresh':
      await ctx.editMessageText('⏳ Refreshing...', HTML);
      setTimeout(() => {
        ctx.editMessageText(`🤖 <b>X1 EcoChain Bot</b>\n\nSelect an option:`, {
          ...HTML, ...keyboards.mainMenu
        }).catch(() => {});
      }, 1000);
      break;

    case 'profile':
      try {
        await ctx.editMessageText('⏳ Loading profile...', HTML);
        const [profileResult, balanceResult] = await Promise.all([api.getUserInfo(), api.getBalance()]);
        if (profileResult.success) {
          await ctx.editMessageText(formatProfile(profileResult.data, balanceResult), { ...HTML, ...keyboards.backButton });
        } else {
          await ctx.editMessageText(`❌ Error: ${safeErr(profileResult.error)}`, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Profile error:', err.message);
        await ctx.editMessageText('❌ An error occurred', { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'quests':
      try {
        await ctx.editMessageText('⏳ Loading quests...', HTML);
        const questsResult = await api.getQuests();
        if (questsResult.success) {
          await ctx.editMessageText(formatQuests(questsResult.data), { ...HTML, ...keyboards.backButton });
        } else {
          await ctx.editMessageText(`❌ Error: ${safeErr(questsResult.error)}`, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Quests error:', err.message);
        await ctx.editMessageText('❌ An error occurred', { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'daily_quests':
      try {
        await ctx.editMessageText('⏳ Loading daily quests...', HTML);
        const dailyResult = await api.getDailyQuests();
        if (dailyResult.success) {
          await ctx.editMessageText(formatDailyQuests(dailyResult.data), { ...HTML, ...keyboards.backButton });
        } else {
          await ctx.editMessageText(`❌ Error: ${safeErr(dailyResult.error)}`, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Daily quests error:', err.message);
        await ctx.editMessageText('❌ An error occurred', { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'faucet':
      try {
        await ctx.editMessageText('⏳ Claiming faucet...', HTML);
        const faucetResult = await api.claimFaucet();
        if (faucetResult.success) {
          await ctx.editMessageText(formatFaucetResponse(faucetResult.data), { ...HTML, ...keyboards.backButton });
        } else {
          await ctx.editMessageText(`❌ <b>Faucet Error</b>\n\n${safeErr(faucetResult.error)}`, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Faucet error:', err.message);
        await ctx.editMessageText('❌ An error occurred', { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'dc_faucet':
      try {
        await ctx.editMessageText(formatDCFaucetCommand(), { ...HTML, ...keyboards.backButton });
      } catch (err) {
        console.error('DC Faucet error:', err.message);
      }
      break;

    case 'auto_daily':
      await ctx.editMessageText(
        `🚀 <b>Auto Complete Daily Quests</b>\n\nThis will attempt to complete all pending daily quests.\n\nProceed?`,
        { ...HTML, ...keyboards.confirmAutoDaily }
      );
      break;

    case 'confirm_auto_daily':
      try {
        await ctx.editMessageText('⏳ Completing daily quests...', HTML);
        const autoResult = await api.completeDailyQuests();
        if (autoResult.success) {
          await ctx.editMessageText(formatAutoResults(autoResult.data), { ...HTML, ...keyboards.backButton });
        } else {
          await ctx.editMessageText(`❌ Error: ${safeErr(autoResult.error)}`, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Auto daily error:', err.message);
        await ctx.editMessageText('❌ An error occurred', { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'social_quests':
      try {
        await ctx.editMessageText('⏳ Loading social quests...', HTML);
        const socialResult = await api.getSocialQuests();
        if (socialResult.success && socialResult.data.length > 0) {
          const text = '🌐 <b>Pending Social Quests</b>\n\n' + socialResult.data.map(q =>
            `✨ <b>${esc(q.title)}</b>\n   💰 ${q.reward} pts | Type: ${esc(q.type)}\n`
          ).join('\n');
          await ctx.editMessageText(text, { ...HTML, ...keyboards.backButton });
        } else {
          await ctx.editMessageText('🎉 No pending social quests!', { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Social quests error:', err.message);
        await ctx.editMessageText('❌ An error occurred', { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'auto_social':
      await ctx.editMessageText(
        `📱 <b>Auto Complete Social Quests</b>\n\nThis will attempt to complete all pending social quests.\n\nProceed?`,
        { ...HTML, ...keyboards.confirmAutoSocial }
      );
      break;

    case 'confirm_auto_social':
      try {
        await ctx.editMessageText('⏳ Completing social quests...', HTML);
        const socialResult = await api.completeSocialQuests();
        if (socialResult.success) {
          await ctx.editMessageText(formatAutoResults(socialResult.data), { ...HTML, ...keyboards.backButton });
        } else {
          await ctx.editMessageText(`❌ Error: ${safeErr(socialResult.error)}`, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Auto social error:', err.message);
        await ctx.editMessageText('❌ An error occurred', { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'transfer':
      try {
        await ctx.editMessageText('⏳ Loading balance...', HTML);
        const balanceResult = await api.getBalance();
        let sendText = `💸 <b>Send X1T Tokens</b>\n\n`;
        if (balanceResult.success) {
          sendText += `💰 <b>Your Balance:</b> ${parseFloat(balanceResult.balance).toFixed(4)} X1T\n\n`;
        }
        sendText += `Just type the address and amount:\n\nExamples:\n• <code>0xCA87257971d64F5F47815C127dcc44a0b2C76815 1</code>\n\nOr press back to cancel.`;
        await ctx.editMessageText(sendText, { ...HTML, ...keyboards.backButton });
      } catch (err) {
        console.error('Transfer menu error:', err.message);
        await ctx.editMessageText('❌ Error loading balance', { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'liquidity': {
      try {
        await ctx.editMessageText('⏳ Memuat info liquidity...', HTML);
        const info = await liquidity.getLiquidityInfo();
        const liqAmount = config.scheduler.liquidityAmount;
        const autoLiqStatus = config.scheduler.autoLiquidity ? `✅ ON (${liqAmount} X1T/hari)` : '❌ OFF';

        let text = `🌊 <b>EcoDex Add Liquidity</b>\n\n`;

        if (info.success && info.hasPosition) {
          text += `🪙 <b>Posisi aktif (NFT #${info.nftTokenId}):</b>\n`;
          text += `   USDT: ${parseFloat(info.amountUSDT).toFixed(6)}\n`;
          text += `   WX1T: ${parseFloat(info.amountWX1T).toFixed(4)}\n`;
          text += `   💰 Nilai: $${parseFloat(info.positionValueUSD).toFixed(6)}\n`;
          text += `   📈 APR: ${esc(info.aprPercent)}%\n`;
          text += `   🔵 Status: ${esc(info.positionStatus)}\n`;
          const feeTot = parseFloat(info.feesUSDT) + parseFloat(info.feesWX1T);
          if (feeTot > 0) text += `   💸 Fee earned: ~$${feeTot.toFixed(8)}\n`;
          text += '\n';
        } else if (info.success && !info.hasPosition) {
          text += `⚠️ <b>Belum ada posisi aktif.</b>\nAkan dibuat posisi baru full-range.\n\n`;
        }

        text += `📊 <b>Harga WX1T:</b> ${info.success ? esc(info.priceWX1TinUSDT) : 'N/A'} USDT\n`;
        text += `💼 <b>Saldo X1T:</b> ${info.success ? parseFloat(info.x1tBalance).toFixed(4) : 'N/A'}\n\n`;
        text += `🔄 <b>Alur:</b>\nX1T → WX1T → 1/2 swap ke USDT → Add ke pool\n\n`;
        text += `💰 <b>Jumlah per hari:</b> ${esc(String(liqAmount))} X1T\n`;
        text += `⚙️ <b>Auto liquidity:</b> ${esc(autoLiqStatus)}\n\n`;
        text += `Lanjutkan add liquidity sekarang?`;

        await ctx.editMessageText(text, { ...HTML, ...keyboards.confirmLiquidity });
      } catch (err) {
        console.error('Liquidity menu error:', err.message);
        await ctx.editMessageText(`❌ Error: ${safeErr(err.message)}`, { ...HTML, ...keyboards.backButton });
      }
      break;
    }

    case 'confirm_liquidity':
      try {
        const liqAmount = config.scheduler.liquidityAmount;
        await ctx.editMessageText(
          `⏳ <b>Menjalankan add liquidity ${esc(String(liqAmount))} X1T...</b>\n\nProses ini mencakup:\n1️⃣ Wrap X1T→WX1T\n2️⃣ Swap 1/2 WX1T→USDT\n3️⃣ Add ke pool USDT/WX1T\n\nTunggu 1-2 menit...`,
          HTML
        );
        const result = await liquidity.performDailyLiquidity(liqAmount);
        if (result.success) {
          let text = `✅ <b>Add Liquidity Selesai!</b>\n\n`;
          text += `💰 <b>Jumlah:</b> ${esc(String(result.liquidityAmount))} X1T\n`;
          if (result.nftTokenId) text += `🪙 <b>NFT Position:</b> #${result.nftTokenId}\n`;
          if (result.action === 'mint') text += `🆕 <b>Posisi baru dibuat!</b>\n`;
          text += `\n📋 <b>Detail langkah:</b>\n`;
          result.steps.forEach(s => {
            text += `${s.success ? '✅' : '❌'} ${esc(s.step)}`;
            if (s.txHash) text += ` — <code>${s.txHash.slice(0, 16)}...</code>`;
            text += '\n';
          });
          if (result.finalBalance) {
            text += `\n💼 <b>Saldo akhir:</b> ${parseFloat(result.finalBalance).toFixed(4)} X1T`;
          }
          await ctx.editMessageText(text, { ...HTML, ...keyboards.backButton });
        } else {
          let text = `❌ <b>Add Liquidity Gagal</b>\n\n${safeErr(result.error)}`;
          if (result.steps?.length > 0) {
            const done = result.steps.filter(s => s.success);
            if (done.length > 0) text += `\n\n✅ Selesai ${done.length} langkah sebelum error`;
          }
          await ctx.editMessageText(text, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Liquidity error:', err.message);
        await ctx.editMessageText(`❌ Error: ${safeErr(err.message)}`, { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'swap': {
      try {
        await ctx.editMessageText('⏳ Memuat info swap...', HTML);
        const balances = await swap.getSwapBalances();
        const swapAmount = config.scheduler.swapAmount;
        const autoSwapStatus = config.scheduler.autoSwap ? `✅ ON (${swapAmount} X1T/hari)` : '❌ OFF';

        let text = `💱 <b>EcoDex Daily Swap</b>\n\n`;
        if (balances.success) {
          text += `💼 <b>Saldo saat ini:</b>\n`;
          text += `   X1T: ${parseFloat(balances.x1t).toFixed(4)}\n`;
          text += `   WX1T: ${parseFloat(balances.wx1t).toFixed(6)}\n`;
          text += `   USDT: ${parseFloat(balances.usdt).toFixed(4)}\n`;
          text += `   💹 Harga WX1T: ${esc(balances.priceWX1TinUSDT)} USDT\n\n`;
        }
        text += `🔄 <b>Alur swap:</b>\nX1T → WX1T → USDT → WX1T → X1T\n\n`;
        text += `💰 <b>Jumlah per swap:</b> ${esc(String(swapAmount))} X1T\n`;
        text += `⚙️ <b>Auto swap harian:</b> ${esc(autoSwapStatus)}\n\n`;
        text += `Jalankan swap sekarang?`;

        await ctx.editMessageText(text, { ...HTML, ...keyboards.confirmSwap });
      } catch (err) {
        console.error('Swap menu error:', err.message);
        await ctx.editMessageText(`❌ Error: ${safeErr(err.message)}`, { ...HTML, ...keyboards.backButton });
      }
      break;
    }

    case 'confirm_swap':
      try {
        const swapAmount = config.scheduler.swapAmount;
        await ctx.editMessageText(
          `⏳ Menjalankan swap ${esc(String(swapAmount))} X1T...\n\nProses ini bisa memakan waktu 1-2 menit.\nTunggu sebentar...`,
          HTML
        );
        const result = await swap.performDailySwap(swapAmount);
        if (result.success) {
          let text = `✅ <b>Swap Selesai!</b>\n\n`;
          text += `💰 <b>Jumlah:</b> ${esc(String(result.swapAmount))} X1T\n\n`;
          text += `📋 <b>Detail:</b>\n`;
          result.steps.forEach(s => {
            text += `${s.success ? '✅' : '❌'} ${esc(s.step)}`;
            if (s.txHash) text += ` — <code>${s.txHash.slice(0, 16)}...</code>`;
            text += '\n';
          });
          if (result.finalBalance) {
            text += `\n💼 <b>Saldo akhir:</b> ${parseFloat(result.finalBalance).toFixed(4)} X1T`;
          }
          await ctx.editMessageText(text, { ...HTML, ...keyboards.backButton });
        } else {
          let text = `❌ <b>Swap Gagal</b>\n\n${safeErr(result.error)}`;
          if (result.steps?.length > 0) {
            const done = result.steps.filter(s => s.success);
            if (done.length > 0) text += `\n\n✅ Selesai ${done.length} langkah sebelum error`;
          }
          await ctx.editMessageText(text, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Swap error:', err.message);
        await ctx.editMessageText(`❌ Swap error: ${safeErr(err.message)}`, { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'run_now': {
      const tz = config.scheduler.timezone;
      const hh = String(config.scheduler.hour).padStart(2, '0');
      const mm = String(config.scheduler.minute).padStart(2, '0');
      await ctx.editMessageText(
        `⚡ <b>Run Auto Tasks Now</b>\n\nIni akan langsung jalankan:\n💧 Claim Faucet\n🎯 Complete Daily Quests\n\nBiasanya berjalan otomatis tiap hari pukul <b>${hh}:${mm} ${tz}</b>\n\nLanjutkan?`,
        { ...HTML, ...keyboards.confirmRunNow }
      );
      break;
    }

    case 'confirm_run_now':
      try {
        await ctx.editMessageText('⏳ Menjalankan semua tugas harian...', HTML);
        await scheduler.runDailyTasks();
        await ctx.editMessageText('✅ <b>Selesai!</b>\n\nHasil sudah dikirim via notifikasi Telegram.', { ...HTML, ...keyboards.backButton });
      } catch (err) {
        console.error('Run now error:', err.message);
        await ctx.editMessageText(`❌ Error: ${safeErr(err.message)}`, { ...HTML, ...keyboards.backButton });
      }
      break;

    case 'create_token': {
      const userId = ctx.from.id;
      tokenSessions.set(userId, { step: 'name' });
      await ctx.editMessageText(
        `🪙 <b>Buat Token ERC20 Baru</b>\n\nToken akan di-deploy langsung di <b>X1 EcoChain Testnet</b> dan didaftarkan ke Constructor.\n\n<b>Langkah 1/4:</b> Ketik <b>nama token</b>\n<i>(contoh: MyToken)</i>`,
        { ...HTML, ...keyboards.cancelTokenCreation }
      );
      break;
    }

    case 'my_tokens': {
      try {
        await ctx.editMessageText('⏳ Memuat daftar token...', HTML);
        const result = await tokenCreator.getMyTokens();
        let text = `📜 <b>Token Saya</b>\n\n`;
        if (result.success && result.tokens.length > 0) {
          result.tokens.forEach((t, i) => {
            text += `${i + 1}. <b>${esc(t.name)}</b>\n`;
            text += `   📍 <code>${esc(t.address)}</code>\n`;
            if (t.features) text += `   🔧 ${esc(t.features)}\n`;
            text += `   🔗 <a href="https://maculatus-scan.x1eco.com/address/${esc(t.address)}">Explorer</a>\n\n`;
          });
        } else if (result.success) {
          text += `<i>Belum ada token yang dibuat.</i>\n\nKlik 🪙 Create Token untuk membuat token pertamamu!`;
        } else {
          text += `❌ ${safeErr(result.error)}`;
        }
        await ctx.editMessageText(text, { ...HTML, disable_web_page_preview: true, ...keyboards.backButton });
      } catch (err) {
        await ctx.editMessageText(`❌ Error: ${safeErr(err.message)}`, { ...HTML, ...keyboards.backButton });
      }
      break;
    }

    case 'cancel_token': {
      const uid = ctx.from.id;
      tokenSessions.delete(uid);
      await ctx.editMessageText(`❌ <b>Pembuatan token dibatalkan.</b>`, { ...HTML, ...keyboards.backButton });
      break;
    }

    case 'confirm_token': {
      const uid = ctx.from.id;
      const session = tokenSessions.get(uid);
      if (!session || session.step !== 'confirm') {
        await ctx.editMessageText('❌ Sesi tidak ditemukan. Mulai ulang dari menu.', { ...HTML, ...keyboards.backButton });
        break;
      }
      tokenSessions.delete(uid);
      try {
        await ctx.editMessageText(
          `⏳ <b>Deploying ${esc(session.symbol)} token...</b>\n\nMengirim transaksi ke X1 EcoChain...\nTunggu 30-60 detik...`,
          HTML
        );
        const result = await tokenCreator.performCreateToken({
          name: session.name,
          symbol: session.symbol,
          decimals: session.decimals,
          supply: session.supply
        });
        if (result.success) {
          let text = `✅ <b>Token Berhasil Dibuat!</b>\n\n`;
          text += `🏷 <b>Nama:</b> ${esc(result.name)}\n`;
          text += `🔤 <b>Symbol:</b> ${esc(result.symbol)}\n`;
          text += `🔢 <b>Decimals:</b> ${result.decimals}\n`;
          text += `💰 <b>Supply:</b> ${parseInt(result.supply).toLocaleString()}\n`;
          text += `📍 <b>Address:</b>\n<code>${esc(result.contractAddress)}</code>\n\n`;
          text += `📋 <b>Langkah:</b>\n`;
          result.steps.forEach(s => {
            text += `${s.success ? '✅' : '⚠️'} ${esc(s.step)}\n`;
            if (s.txHash) text += `   <code>${s.txHash.slice(0, 16)}...</code>\n`;
          });
          text += `\n🔗 <a href="${esc(result.explorerUrl)}">Lihat di Explorer</a>`;
          await ctx.editMessageText(text, { ...HTML, disable_web_page_preview: true, ...keyboards.backButton });
        } else {
          await ctx.editMessageText(`❌ <b>Deploy Gagal</b>\n\n${safeErr(result.error)}`, { ...HTML, ...keyboards.backButton });
        }
      } catch (err) {
        console.error('Token deploy error:', err.message);
        await ctx.editMessageText(`❌ Deploy error: ${safeErr(err.message)}`, { ...HTML, ...keyboards.backButton });
      }
      break;
    }

    default:
      await ctx.editMessageText('❓ Unknown action', { ...HTML, ...keyboards.backButton });
  }
}

async function handleTransfer(ctx) {
  const userId = ctx.from.id;
  const match = ctx.match;

  if (!isAllowed(userId)) return ctx.reply('⛔ You are not authorized to use this bot.');

  const toAddress = match[1];
  const amount = match[2];

  if (!amount) {
    return ctx.reply(
      `📝 <b>Recipient Address:</b> <code>${esc(toAddress.slice(0, 6))}...${esc(toAddress.slice(-4))}</code>\n\nReply with amount (in X1T) to send:`,
      HTML
    );
  }

  if (isNaN(amount) || parseFloat(amount) <= 0) {
    return ctx.reply('❌ Invalid amount. Must be a positive number');
  }

  try {
    await ctx.reply('⏳ Processing transfer...');
    const result = await api.sendTransfer(toAddress, parseFloat(amount));
    if (result.success) {
      let text = `✅ <b>Transfer Successful</b>\n\n`;
      text += `📤 <b>To:</b> <code>${esc(toAddress.slice(0, 6))}...${esc(toAddress.slice(-4))}</code>\n`;
      text += `💰 <b>Amount:</b> ${esc(String(amount))} X1T\n`;
      if (result.data.tx_hash) {
        text += `📝 <b>TX Hash:</b> <code>${result.data.tx_hash.slice(0, 10)}...</code>\n`;
      }
      await ctx.reply(text, { ...HTML, ...keyboards.mainMenu });
    } else {
      await ctx.reply(`❌ Transfer Failed\n\n${safeErr(result.error)}`, { ...HTML, ...keyboards.mainMenu });
    }
  } catch (err) {
    console.error('Transfer error:', err.message);
    await ctx.reply('❌ An error occurred during transfer', { ...keyboards.mainMenu });
  }
}

// ─── Token creation conversation ──────────────────────────────────────────────
async function handleTextMessage(ctx) {
  const userId = ctx.from.id;
  if (!isAllowed(userId)) return;

  const session = tokenSessions.get(userId);
  if (!session) return;

  const text = ctx.message.text?.trim();
  if (!text) return;

  try {
    if (session.step === 'name') {
      if (text.length < 1 || text.length > 50) {
        return ctx.reply('❌ Nama token harus 1-50 karakter. Coba lagi:', keyboards.cancelTokenCreation);
      }
      session.name = text;
      session.step = 'symbol';
      tokenSessions.set(userId, session);
      return ctx.reply(
        `✅ Nama: <b>${esc(text)}</b>\n\n<b>Langkah 2/4:</b> Ketik <b>simbol token</b>\n<i>(contoh: MTK, max 10 karakter, huruf kapital)</i>`,
        { ...HTML, ...keyboards.cancelTokenCreation }
      );
    }

    if (session.step === 'symbol') {
      const sym = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (sym.length < 1 || sym.length > 10) {
        return ctx.reply('❌ Simbol harus 1-10 karakter huruf/angka. Coba lagi:', keyboards.cancelTokenCreation);
      }
      session.symbol = sym;
      session.step = 'supply';
      tokenSessions.set(userId, session);
      return ctx.reply(
        `✅ Symbol: <b>${esc(sym)}</b>\n\n<b>Langkah 3/4:</b> Ketik <b>total supply</b> (jumlah token)\n<i>(contoh: 1000000 untuk 1 juta token)</i>`,
        { ...HTML, ...keyboards.cancelTokenCreation }
      );
    }

    if (session.step === 'supply') {
      const supply = parseInt(text.replace(/[,._]/g, ''));
      if (isNaN(supply) || supply < 1 || supply > 1000000000000) {
        return ctx.reply('❌ Supply harus angka antara 1 - 1,000,000,000,000. Coba lagi:', keyboards.cancelTokenCreation);
      }
      session.supply = supply;
      session.step = 'decimals';
      tokenSessions.set(userId, session);
      return ctx.reply(
        `✅ Supply: <b>${supply.toLocaleString()}</b>\n\n<b>Langkah 4/4:</b> Ketik <b>jumlah desimal</b>\n<i>(umumnya 18, ketik 18 atau angka lain antara 0-18)</i>`,
        { ...HTML, ...keyboards.cancelTokenCreation }
      );
    }

    if (session.step === 'decimals') {
      const dec = parseInt(text);
      if (isNaN(dec) || dec < 0 || dec > 18) {
        return ctx.reply('❌ Desimal harus antara 0-18. Coba lagi:', keyboards.cancelTokenCreation);
      }
      session.decimals = dec;
      session.step = 'confirm';
      tokenSessions.set(userId, session);

      const confirmText =
        `🪙 <b>Konfirmasi Deploy Token</b>\n\n` +
        `🏷 <b>Nama:</b> ${esc(session.name)}\n` +
        `🔤 <b>Symbol:</b> ${esc(session.symbol)}\n` +
        `🔢 <b>Decimals:</b> ${dec}\n` +
        `💰 <b>Total Supply:</b> ${session.supply.toLocaleString()}\n\n` +
        `⛓ <b>Network:</b> X1 EcoChain Testnet\n` +
        `⛽ <b>Gas:</b> ~0.005 X1T\n\n` +
        `Konfirmasi deploy?`;

      return ctx.reply(confirmText, { ...HTML, ...keyboards.confirmTokenCreation });
    }

  } catch (err) {
    console.error('Token conversation error:', err.message);
    tokenSessions.delete(userId);
    ctx.reply('❌ Terjadi error. Mulai ulang dari menu.', keyboards.backButton);
  }
}

module.exports = {
  handleStart,
  handleCallback,
  handleTransfer,
  handleTextMessage
};
