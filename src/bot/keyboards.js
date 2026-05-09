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
        { text: '🌊 Add Liquidity', callback_data: 'liquidity' }
      ],
      [
        { text: '🪙 Create Token', callback_data: 'create_token' },
        { text: '📜 My Tokens', callback_data: 'my_tokens' }
      ],
      [
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

const confirmLiquidity = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '✅ Add Liquidity', callback_data: 'confirm_liquidity' },
        { text: '❌ Cancel', callback_data: 'menu' }
      ]
    ]
  }
};

const cancelTokenCreation = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '❌ Batal', callback_data: 'cancel_token' }]
    ]
  }
};

const confirmTokenCreation = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🚀 Deploy Token', callback_data: 'confirm_token' },
        { text: '❌ Batal', callback_data: 'cancel_token' }
      ]
    ]
  }
};

// ─── Feature Selection Keyboard (dynamic) ────────────────────────────────────
const AVAILABLE_FEATURES = [
  { key: 'pausable',      label: 'Pausable',       desc: 'Token bisa di-pause' },
  { key: 'burnable',      label: 'Burnable Token',  desc: 'Token bisa dibakar' },
  { key: 'mintable',      label: 'Mintable',        desc: 'Token bisa dicetak' },
  { key: 'whitelist',     label: 'Whitelist',       desc: 'Hanya alamat tertentu' },
  { key: 'taxable',       label: 'Taxable',         desc: 'Ada pajak transaksi' }
];

function buildFeatureKeyboard(selectedKeys = []) {
  const rows = AVAILABLE_FEATURES.map(f => {
    const isOn = selectedKeys.includes(f.key);
    return [{
      text: `${isOn ? '✅' : '⬜'} ${f.label}`,
      callback_data: `toggle_feature_${f.key}`
    }];
  });
  rows.push([
    { text: '➡️ Lanjut (Isi Info Token)', callback_data: 'features_done' },
    { text: '❌ Batal', callback_data: 'cancel_token' }
  ]);
  return { reply_markup: { inline_keyboard: rows } };
}

// ─── Token Management Keyboard (dynamic per token features) ──────────────────
function buildTokenManageKeyboard(tokenAddress, features = {}, info = {}) {
  const rows = [];

  // Row: Pause / Unpause (only if Pausable feature)
  if (features.pausable) {
    const isPaused = info.paused === true;
    rows.push([
      isPaused
        ? { text: '▶️ Unpause Token', callback_data: `tm_unpause:${tokenAddress}` }
        : { text: '⏸ Pause Token',   callback_data: `tm_pause:${tokenAddress}` }
    ]);
  }

  // Row: Mint (only if Mintable)
  if (features.mintable) {
    rows.push([{ text: '🪙 Mint Token', callback_data: `tm_mint:${tokenAddress}` }]);
  }

  // Row: Burn (only if Burnable)
  if (features.burnable) {
    rows.push([{ text: '🔥 Burn Token', callback_data: `tm_burn:${tokenAddress}` }]);
  }

  // Row: Whitelist toggle (only if Whitelist)
  if (features.whitelist) {
    const isActive = info.whitelistActive !== false;
    rows.push([
      isActive
        ? { text: '❌ Nonaktifkan Whitelist', callback_data: `tm_wl_off:${tokenAddress}` }
        : { text: '✅ Aktifkan Whitelist',    callback_data: `tm_wl_on:${tokenAddress}` }
    ]);
  }

  // Row: Set Tax Wallet (only if Taxable)
  if (features.taxable) {
    rows.push([{ text: '💼 Ganti Tax Wallet', callback_data: `tm_settax:${tokenAddress}` }]);
  }

  // Row: Explorer + Constructor links
  rows.push([
    { text: '🔍 Explorer', url: `https://maculatus-scan.x1eco.com/address/${tokenAddress}` },
    { text: '🛠 Constructor', url: `https://constructor.x1ecochain.com/ManageToken?contract=${tokenAddress}` }
  ]);

  // Row: Back to token list
  rows.push([{ text: '◀️ Kembali ke Daftar Token', callback_data: 'my_tokens' }]);

  return { reply_markup: { inline_keyboard: rows } };
}

module.exports = {
  mainMenu,
  backButton,
  confirmAutoDaily,
  confirmAutoSocial,
  confirmRunNow,
  confirmSwap,
  confirmLiquidity,
  cancelTokenCreation,
  confirmTokenCreation,
  buildFeatureKeyboard,
  buildTokenManageKeyboard,
  AVAILABLE_FEATURES
};
