const CACHE_KEY = 'userConfigCache_v1';

const CACHE_FIELDS = [
  'cycleStartDate',
  'remindTime',
  'reminderEnabled',
  'subscriptionAccepted'
];

function pickCacheFields(obj) {
  if (!obj || typeof obj !== 'object') {
    return {};
  }
  const picked = {};
  CACHE_FIELDS.forEach((key) => {
    if (obj[key] !== undefined) {
      picked[key] = obj[key];
    }
  });
  return picked;
}

function readUserConfigCache() {
  try {
    const raw = wx.getStorageSync(CACHE_KEY);
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    return pickCacheFields(raw);
  } catch (e) {
    return null;
  }
}

function writeUserConfigCache(partial) {
  if (!partial || typeof partial !== 'object') {
    return;
  }
  try {
    const existing = readUserConfigCache() || {};
    const next = {
      ...existing,
      ...pickCacheFields(partial)
    };
    wx.setStorageSync(CACHE_KEY, next);
  } catch (e) {
    console.warn('[user-config-cache] write failed', e);
  }
}

function clearUserConfigCache() {
  try {
    wx.removeStorageSync(CACHE_KEY);
  } catch (e) {
    console.warn('[user-config-cache] clear failed', e);
  }
}

module.exports = {
  readUserConfigCache,
  writeUserConfigCache,
  clearUserConfigCache
};
