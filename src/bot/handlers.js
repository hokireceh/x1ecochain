const api = require('../services/api');
const keyboards = require('./keyboards');
const config = require('../config');

function isAllowed(userId) {
  if (config.telegram.allowedUsers.length === 0) return true;
  return config.telegram.allowedUsers.includes(userId);
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/[_*`\[]/g, '\\$&');
}

function formatProfile(data) {
  let text = `👤 *Your Profile*

💼 *Wallet:* \`${data.address.slice(0, 6)}...${data.address.slice(-4)}\`
⭐ *Points:* ${data.points}
🏆 *Rank:* #${data.rank}\n`;

  if (data.linked_accounts && data.linked_accounts.length > 0) {
    text += `\n🔗 *Linked Accounts:*\n`;
    data.linked_accounts.forEach(acc => {
      const icon = acc.accountType === 'x' ? '𝕏' : acc.accountType === 'discord' ? '💬' : '🔗';
      text += `${icon} ${acc.accountType.toUpperCase()}: @${escapeMarkdown(acc.accountUserName)}\n`;
    });
  }

  text += `\n📅 Updated: ${new Date(data.updated_at).toLocaleDateString()}`;
  return text;
}

function formatQuests(quests) {
  if (quests.length === 0) return '📋 No quests available.';
  
  let text = '📋 *Available Quests*\n\n';
  let completedCount = 0;
  
  quests.forEach((q) => {
    const status = q.is_completed_today ? '✅' : (q.is_completed ? '☑️' : '⏳');
    const period = q.periodicity === 'daily' ? '🔄' : (q.periodicity === 'one_time' ? '1️⃣' : '📅');
    if (q.is_completed_today) completedCount++;
    
    const categoryIcon = q.category === 'social' ? '🌐' : (q.category === 'onchain' ? '⛓️' : '📌');
    
    text += `${status} *${escapeMarkdown(q.title)}*\n`;
    text += `   ${categoryIcon} ${escapeMarkdown(q.category)} | ${period} ${escapeMarkdown(q.periodicity)}\n`;
    text += `   💰 ${q.reward} pts | Completed: ${q.total_completions}\n\n`;
  });
  
  text += `*Progress: ${completedCount}/${quests.length} completed today*`;
  return text.trim();
}

function formatDailyQuests(quests) {
  if (quests.length === 0) return '🎯 No daily quests available.';
  
  let text = '🎯 *Daily Quests Today*\n\n';
  let completedCount = 0;
  
  quests.forEach((q) => {
    const status = q.is_completed_today ? '✅ Done' : '⏳ Pending';
    if (q.is_completed_today) completedCount++;
    
    text += `${status} *${escapeMarkdown(q.title)}*\n`;
    text += `   💰 ${q.reward} pts\n`;
    if (q.call_to_action && q.call_to_action !== 'faucet' && q.call_to_action !== 'transfer') {
      text += `   🔗 ${escapeMarkdown(q.call_to_action.slice(0, 40))}\n`;
    }
    text += '\n';
  });
  
  text += `*Completed: ${completedCount}/${quests.length}*`;
  return text.trim();
}

function formatAutoResults(results) {
  let text = '🚀 *Auto Complete Results*\n\n';
  let totalRewards = 0;
  let successCount = 0;
  let failCount = 0;
  
  results.forEach(r => {
    if (r.skipped) {
      text += `☑️ *${escapeMarkdown(r.title)}*\n   Already completed\n\n`;
    } else if (r.success) {
      text += `✅ *${escapeMarkdown(r.title)}*\n   +${r.reward} pts earned!\n\n`;
      totalRewards += r.reward;
      successCount++;
    } else {
      text += `❌ *${escapeMarkdown(r.title)}*\n   ${escapeMarkdown(r.error || 'Failed')}\n\n`;
      failCount++;
    }
  });
  
  text += `*Summary: ${successCount} ✅ | ${failCount} ❌*\n`;
  text += `💰 *Total Earned:* ${totalRewards} pts`;
  return text.trim();
}

function formatFaucetResponse(data) {
  if (!data) return '❌ No response from faucet';
  
  let text = `💧 *Faucet Claimed!*\n\n`;
  
  if (data.message) text += `✅ ${data.message}\n`;
  if (data.amount) text += `💰 Amount: ${data.amount}\n`;
  if (data.tx_hash) text += `📝 TX: \`${data.tx_hash.slice(0, 10)}...\`\n`;
  if (data.next_claim) text += `⏰ Next claim: ${new Date(data.next_claim).toLocaleString()}\n`;
  
  return text;
}

function formatDCFaucetCommand() {
  const address = global.walletAddress;
  return `🔗 *Discord Faucet Command*

*1. Open Faucet Channel:*
https://discord.com/channels/1338212210987765830/1414784870495948912

*2. Copy this command to Discord:*

\`\`\`
/faucet address: ${address}
\`\`\`

*3. Paste and send!*`;
}

async function handleStart(ctx) {
  const userId = ctx.from.id;
  
  if (!isAllowed(userId)) {
    return ctx.reply('⛔ You are not authorized to use this bot.');
  }
  
  const welcomeText = `🤖 *X1 EcoChain Bot*

Welcome! Use the menu below to manage your X1 EcoChain quests and faucet.

Select an option:`;
  
  await ctx.reply(welcomeText, { 
    parse_mode: 'Markdown',
    ...keyboards.mainMenu 
  });
}

async function handleCallback(ctx) {
  const userId = ctx.from.id;
  const action = ctx.callbackQuery.data;
  
  if (!isAllowed(userId)) {
    return ctx.answerCbQuery('Not authorized', { show_alert: true });
  }
  
  await ctx.answerCbQuery();
  
  switch (action) {
    case 'menu':
      const menuText = `🤖 *X1 EcoChain Bot*

Select an option:`;
      await ctx.editMessageText(menuText, {
        parse_mode: 'Markdown',
        ...keyboards.mainMenu
      });
      break;
      
    case 'refresh':
      await ctx.editMessageText('⏳ Refreshing...', { parse_mode: 'Markdown' });
      setTimeout(() => {
        ctx.editMessageText(`🤖 *X1 EcoChain Bot*\n\nSelect an option:`, {
          parse_mode: 'Markdown',
          ...keyboards.mainMenu
        }).catch(() => {});
      }, 1000);
      break;
      
    case 'profile':
      try {
        await ctx.editMessageText('⏳ Loading profile...', { parse_mode: 'Markdown' });
        const profileResult = await api.getUserInfo();
        if (profileResult.success) {
          await ctx.editMessageText(formatProfile(profileResult.data), {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        } else {
          await ctx.editMessageText(`❌ Error: ${profileResult.error}`, {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        }
      } catch (err) {
        console.error('Profile error:', err.message);
        await ctx.editMessageText('❌ An error occurred', {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      }
      break;
      
    case 'quests':
      try {
        await ctx.editMessageText('⏳ Loading quests...', { parse_mode: 'Markdown' });
        const questsResult = await api.getQuests();
        if (questsResult.success) {
          await ctx.editMessageText(formatQuests(questsResult.data), {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        } else {
          await ctx.editMessageText(`❌ Error: ${questsResult.error}`, {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        }
      } catch (err) {
        console.error('Quests error:', err.message);
        await ctx.editMessageText('❌ An error occurred', {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      }
      break;
      
    case 'daily_quests':
      try {
        await ctx.editMessageText('⏳ Loading daily quests...', { parse_mode: 'Markdown' });
        const dailyResult = await api.getDailyQuests();
        if (dailyResult.success) {
          await ctx.editMessageText(formatDailyQuests(dailyResult.data), {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        } else {
          await ctx.editMessageText(`❌ Error: ${dailyResult.error}`, {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        }
      } catch (err) {
        console.error('Daily quests error:', err.message);
        await ctx.editMessageText('❌ An error occurred', {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      }
      break;
      
    case 'faucet':
      try {
        await ctx.editMessageText('⏳ Claiming faucet...', { parse_mode: 'Markdown' });
        const faucetResult = await api.claimFaucet();
        if (faucetResult.success) {
          await ctx.editMessageText(formatFaucetResponse(faucetResult.data), {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        } else {
          await ctx.editMessageText(`❌ Faucet Error\n\n${faucetResult.error}`, {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        }
      } catch (err) {
        console.error('Faucet error:', err.message);
        await ctx.editMessageText('❌ An error occurred', {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      }
      break;
      
    case 'dc_faucet':
      try {
        await ctx.editMessageText(formatDCFaucetCommand(), {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      } catch (err) {
        console.error('DC Faucet error:', err.message);
      }
      break;
      
    case 'auto_daily':
      const confirmText = `🚀 *Auto Complete Daily Quests*

This will attempt to complete all pending daily quests.

Proceed?`;
      await ctx.editMessageText(confirmText, {
        parse_mode: 'Markdown',
        ...keyboards.confirmAutoDaily
      });
      break;
      
    case 'confirm_auto_daily':
      try {
        await ctx.editMessageText('⏳ Completing daily quests...', { parse_mode: 'Markdown' });
        const autoResult = await api.completeDailyQuests();
        if (autoResult.success) {
          await ctx.editMessageText(formatAutoResults(autoResult.data), {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        } else {
          await ctx.editMessageText(`❌ Error: ${autoResult.error}`, {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        }
      } catch (err) {
        console.error('Auto daily error:', err.message);
        await ctx.editMessageText('❌ An error occurred', {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      }
      break;
      
    case 'social_quests':
      try {
        await ctx.editMessageText('⏳ Loading social quests...', { parse_mode: 'Markdown' });
        const socialResult = await api.getSocialQuests();
        if (socialResult.success && socialResult.data.length > 0) {
          const text = '🌐 *Pending Social Quests*\n\n' + socialResult.data.map(q => 
            `✨ *${escapeMarkdown(q.title)}*\n   💰 ${q.reward} pts | Type: ${escapeMarkdown(q.type)}\n`
          ).join('\n');
          await ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        } else {
          await ctx.editMessageText('🎉 No pending social quests!', {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        }
      } catch (err) {
        console.error('Social quests error:', err.message);
        await ctx.editMessageText('❌ An error occurred', {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      }
      break;
      
    case 'auto_social':
      const confirmSocialText = `📱 *Auto Complete Social Quests*

This will attempt to complete all pending social quests.

Proceed?`;
      await ctx.editMessageText(confirmSocialText, {
        parse_mode: 'Markdown',
        ...keyboards.confirmAutoSocial
      });
      break;
      
    case 'confirm_auto_social':
      try {
        await ctx.editMessageText('⏳ Completing social quests...', { parse_mode: 'Markdown' });
        const socialResult = await api.completeSocialQuests();
        if (socialResult.success) {
          await ctx.editMessageText(formatAutoResults(socialResult.data), {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        } else {
          await ctx.editMessageText(`❌ Error: ${socialResult.error}`, {
            parse_mode: 'Markdown',
            ...keyboards.backButton
          });
        }
      } catch (err) {
        console.error('Auto social error:', err.message);
        await ctx.editMessageText('❌ An error occurred', {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      }
      break;
      
    case 'transfer':
      try {
        await ctx.editMessageText('⏳ Loading balance...', { parse_mode: 'Markdown' });
        const balanceResult = await api.getBalance();
        
        let sendText = `💸 *Send X1T Tokens*\n\n`;
        
        if (balanceResult.success) {
          const balance = parseFloat(balanceResult.balance).toFixed(4);
          sendText += `💰 *Your Balance:* ${balance} X1T\n\n`;
        }
        
        sendText += `Just type the address and amount:

Examples:
• \`0xCA87257971d64F5F47815C127dcc44a0b2C76815 1\`

Or press back to cancel.`;
        
        await ctx.editMessageText(sendText, {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      } catch (err) {
        console.error('Transfer menu error:', err.message);
        await ctx.editMessageText('❌ Error loading balance', {
          parse_mode: 'Markdown',
          ...keyboards.backButton
        });
      }
      break;
      
    default:
      await ctx.editMessageText('❓ Unknown action', {
        parse_mode: 'Markdown',
        ...keyboards.backButton
      });
  }
}

async function handleTransfer(ctx) {
  const userId = ctx.from.id;
  const match = ctx.match;
  
  if (!isAllowed(userId)) {
    return ctx.reply('⛔ You are not authorized to use this bot.');
  }
  
  const toAddress = match[1];
  const amount = match[2]; // Optional
  
  if (!amount) {
    return ctx.reply(`📝 *Recipient Address:* \`${toAddress.slice(0, 6)}...${toAddress.slice(-4)}\`\n\nReply with amount (in X1T) to send:`, { parse_mode: 'Markdown' });
  }
  
  if (isNaN(amount) || parseFloat(amount) <= 0) {
    return ctx.reply('❌ Invalid amount. Must be a positive number');
  }
  
  try {
    await ctx.reply('⏳ Processing transfer...');
    const result = await api.sendTransfer(toAddress, parseFloat(amount));
    
    if (result.success) {
      let text = `✅ *Transfer Successful*\n\n`;
      text += `📤 *To:* \`${toAddress.slice(0, 6)}...${toAddress.slice(-4)}\`\n`;
      text += `💰 *Amount:* ${amount} X1T\n`;
      if (result.data.tx_hash) {
        text += `📝 *TX Hash:* \`${result.data.tx_hash.slice(0, 10)}...\`\n`;
      }
      await ctx.reply(text, { parse_mode: 'Markdown', ...keyboards.mainMenu });
    } else {
      await ctx.reply(`❌ Transfer Failed\n\n${result.error}`, { parse_mode: 'Markdown', ...keyboards.mainMenu });
    }
  } catch (err) {
    console.error('Transfer error:', err.message);
    await ctx.reply('❌ An error occurred during transfer', { ...keyboards.mainMenu });
  }
}

module.exports = {
  handleStart,
  handleCallback,
  handleTransfer
};