const api = require('./api');
const auth = require('./auth');
const config = require('../config');

let schedulerInterval = null;
let botInstance = null;
let lastRunDate = null;

function setBotInstance(bot) {
  botInstance = bot;
}

async function sendNotification(message) {
  if (!botInstance) return;
  const chatIds = config.telegram.allowedUsers;
  if (chatIds.length === 0) {
    console.log('⚠️  No ALLOWED_USER_IDS set — cannot send auto notification');
    return;
  }
  for (const chatId of chatIds) {
    try {
      await botInstance.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`❌ Failed to send notification to ${chatId}:`, err.message);
    }
  }
}

async function runDailyTasks() {
  console.log('🤖 [Auto Scheduler] Running daily tasks...');

  let report = `🤖 *Auto Daily Report*\n📅 ${new Date().toLocaleString('id-ID', { timeZone: config.scheduler.timezone })}\n\n`;

  // Refresh token sebelum mulai
  try {
    global.x1AuthToken = await auth.getValidToken(config.x1api.walletPrivateKey);
    console.log('✅ [Scheduler] Token refreshed');
  } catch (err) {
    console.error('❌ [Scheduler] Token refresh failed:', err.message);
    report += `❌ *Token refresh failed*: ${err.message}\n`;
    await sendNotification(report);
    return;
  }

  // 1. Claim Faucet
  if (config.scheduler.autoFaucet) {
    console.log('💧 [Scheduler] Claiming faucet...');
    try {
      const faucetResult = await api.claimFaucet();
      if (faucetResult.success) {
        const d = faucetResult.data;
        report += `💧 *Faucet:* ✅ Claimed!\n`;
        if (d?.amount) report += `   💰 Amount: ${d.amount}\n`;
        if (d?.message) report += `   📝 ${d.message}\n`;
        console.log('✅ [Scheduler] Faucet claimed');
      } else {
        report += `💧 *Faucet:* ❌ ${faucetResult.error}\n`;
        console.log('⚠️ [Scheduler] Faucet failed:', faucetResult.error);
      }
    } catch (err) {
      report += `💧 *Faucet:* ❌ ${err.message}\n`;
      console.error('❌ [Scheduler] Faucet error:', err.message);
    }
    report += '\n';
  }

  // 2. Complete Daily Quests
  if (config.scheduler.autoDailyQuests) {
    console.log('🎯 [Scheduler] Completing daily quests...');
    try {
      const dailyResult = await api.completeDailyQuests();
      if (dailyResult.success) {
        const quests = dailyResult.data;
        if (quests.length === 0) {
          report += `🎯 *Daily Quests:* ✅ All already completed!\n`;
          console.log('✅ [Scheduler] Daily quests: all already done');
        } else {
          let totalPts = 0;
          let successCount = 0;
          let failCount = 0;
          report += `🎯 *Daily Quests:*\n`;
          quests.forEach(q => {
            if (q.success) {
              report += `   ✅ ${q.title} +${q.reward} pts\n`;
              totalPts += q.reward || 0;
              successCount++;
            } else {
              report += `   ❌ ${q.title}: ${q.error || 'Failed'}\n`;
              failCount++;
            }
          });
          report += `   📊 *${successCount} ✅ | ${failCount} ❌ | +${totalPts} pts total*\n`;
          console.log(`✅ [Scheduler] Daily quests: ${successCount} done, ${failCount} failed`);
        }
      } else {
        report += `🎯 *Daily Quests:* ❌ ${dailyResult.error}\n`;
        console.log('⚠️ [Scheduler] Daily quests failed:', dailyResult.error);
      }
    } catch (err) {
      report += `🎯 *Daily Quests:* ❌ ${err.message}\n`;
      console.error('❌ [Scheduler] Daily quests error:', err.message);
    }
  }

  report += `\n⏰ *Next run:* tomorrow at ${String(config.scheduler.hour).padStart(2, '0')}:${String(config.scheduler.minute).padStart(2, '0')} (${config.scheduler.timezone})`;

  await sendNotification(report);
  console.log('✅ [Scheduler] Daily tasks completed, notification sent');
}

function getTodayDateString(timezone) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

function getNextRunMs() {
  const now = new Date();
  const tz = config.scheduler.timezone;
  const hour = config.scheduler.hour;
  const minute = config.scheduler.minute;

  // Build target datetime string in the configured timezone
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
  const targetStr = `${todayStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

  // Parse as local time in that timezone using Intl
  const target = new Date(new Date(targetStr).toLocaleString('en-US', { timeZone: 'UTC' }));

  // Calculate UTC offset difference
  const utcOffset = getTimezoneOffsetMs(tz, now);
  const targetUTC = new Date(targetStr).getTime() - utcOffset;

  let msUntil = targetUTC - now.getTime();
  if (msUntil <= 0) {
    msUntil += 24 * 60 * 60 * 1000; // next day
  }
  return msUntil;
}

function getTimezoneOffsetMs(tz, date) {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = date.toLocaleString('en-US', { timeZone: tz });
  return new Date(utcStr) - new Date(tzStr);
}

function scheduleNext() {
  const now = new Date();
  const tz = config.scheduler.timezone;
  const hour = config.scheduler.hour;
  const minute = config.scheduler.minute;

  // Find next occurrence of hour:minute in target timezone
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const todayRun = new Date(nowInTz);
  todayRun.setHours(hour, minute, 0, 0);

  let msUntil = todayRun - nowInTz;
  if (msUntil <= 0) {
    msUntil += 24 * 60 * 60 * 1000;
  }

  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  const hoursUntil = (msUntil / 3600000).toFixed(2);
  console.log(`⏰ [Scheduler] Next auto run at ${hh}:${mm} ${tz} (in ${hoursUntil}h)`);

  schedulerInterval = setTimeout(async () => {
    const todayDate = getTodayDateString(tz);
    if (lastRunDate !== todayDate) {
      lastRunDate = todayDate;
      await runDailyTasks();
    } else {
      console.log('⚠️  [Scheduler] Already ran today, skipping duplicate trigger');
    }
    scheduleNext();
  }, msUntil);
}

function startScheduler(bot) {
  setBotInstance(bot);

  if (!config.scheduler.enabled) {
    console.log('⏸️  [Scheduler] Auto scheduler disabled (AUTO_SCHEDULER=false)');
    return;
  }

  console.log(`🚀 [Scheduler] Starting — auto tasks every day at ${String(config.scheduler.hour).padStart(2, '0')}:${String(config.scheduler.minute).padStart(2, '0')} ${config.scheduler.timezone}`);
  console.log(`   💧 Auto Faucet: ${config.scheduler.autoFaucet ? 'ON' : 'OFF'}`);
  console.log(`   🎯 Auto Daily Quests: ${config.scheduler.autoDailyQuests ? 'ON' : 'OFF'}`);

  scheduleNext();
}

function stopScheduler() {
  if (schedulerInterval) {
    clearTimeout(schedulerInterval);
    schedulerInterval = null;
    console.log('🛑 [Scheduler] Stopped');
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runDailyTasks
};
