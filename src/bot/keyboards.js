const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '👤 My Profile', callback_data: 'profile' },
        { text: '📋 All Quests', callback_data: 'quests' }
      ],
      [
        { text: '🎯 Daily Quests', callback_data: 'daily_quests' },
        { text: '🌐 Social Quests', callback_data: 'social_quests' }
      ],
      [
        { text: '💧 Claim Faucet', callback_data: 'faucet' },
        { text: '🔗 DC Faucet', callback_data: 'dc_faucet' }
      ],
      [
        { text: '💱 Daily Swap', callback_data: 'swap' },
        { text: '💸 Send X1T', callback_data: 'transfer' }
      ],
      [
        { text: '🚀 Auto Daily', callback_data: 'auto_daily' },
        { text: '📱 Auto Social', callback_data: 'auto_social' }
      ],
      [
        { text: '⚡ Run Auto Now', callback_data: 'run_now' }
      ],
      [
        { text: '🔄 Refresh', callback_data: 'refresh' }
      ]
    ]
  }
};

const backButton = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '◀️ Back to Menu', callback_data: 'menu' }]
    ]
  }
};

const confirmAutoDaily = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '✅ Yes, Complete All', callback_data: 'confirm_auto_daily' },
        { text: '❌ Cancel', callback_data: 'menu' }
      ]
    ]
  }
};

const confirmAutoSocial = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '✅ Yes, Complete All', callback_data: 'confirm_auto_social' },
        { text: '❌ Cancel', callback_data: 'menu' }
      ]
    ]
  }
};

const confirmRunNow = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '✅ Run Now', callback_data: 'confirm_run_now' },
        { text: '❌ Cancel', callback_data: 'menu' }
      ]
    ]
  }
};

const confirmSwap = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '✅ Swap Now', callback_data: 'confirm_swap' },
        { text: '❌ Cancel', callback_data: 'menu' }
      ]
    ]
  }
};

module.exports = {
  mainMenu,
  backButton,
  confirmAutoDaily,
  confirmAutoSocial,
  confirmRunNow,
  confirmSwap
};
