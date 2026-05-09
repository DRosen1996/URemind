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
      subscriptionAccepted: false,
      lastInAppReminderDate: '',
      status: 'active'
    };
  }

  return result.data[0];
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
