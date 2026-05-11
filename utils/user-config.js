const COLLECTION = 'users';

function getOpenId() {
  return wx.cloud.callFunction({
    name: 'getOpenId'
  }).then((res) => res.result.openid);
}

async function loadUserConfig() {
  const openid = await getOpenId();
  const db = wx.cloud.database();
  const result = await db.collection(COLLECTION).where({ openid }).limit(1).get();

  if (!result.data.length) {
    return {
      openid,
      cycleStartDate: '',
      remindTime: '21:00',
      timezone: 'Asia/Shanghai',
      reminderEnabled: false,
      subscriptionAccepted: false,
      status: 'active'
    };
  }

  const config = result.data[0];
  const reminderEnabled = typeof config.reminderEnabled === 'boolean'
    ? config.reminderEnabled
    : (config.status === 'active' && !!config.subscriptionAccepted);

  return {
    ...config,
    reminderEnabled
  };
}

function saveUserConfig(data) {
  return wx.cloud.callFunction({
    name: 'saveUserConfig',
    data
  });
}

module.exports = {
  loadUserConfig,
  saveUserConfig
};
