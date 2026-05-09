const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const now = new Date();

  const existing = await db.collection('users').where({ openid }).limit(1).get();
  const current = existing.data[0] || {};

  const payload = {
    cycleStartDate: typeof event.cycleStartDate === 'string' ? event.cycleStartDate : (current.cycleStartDate || ''),
    remindTime: typeof event.remindTime === 'string' ? event.remindTime : (current.remindTime || '21:00'),
    timezone: typeof event.timezone === 'string' ? event.timezone : (current.timezone || 'Asia/Shanghai'),
    subscriptionAccepted: typeof event.subscriptionAccepted === 'boolean'
      ? event.subscriptionAccepted
      : !!current.subscriptionAccepted,
    status: typeof event.status === 'string' ? event.status : (current.status || 'active'),
    updatedAt: now
  };

  if (typeof event.lastInAppReminderDate === 'string') {
    payload.lastInAppReminderDate = event.lastInAppReminderDate;
  } else if (typeof current.lastInAppReminderDate === 'string') {
    payload.lastInAppReminderDate = current.lastInAppReminderDate;
  }
  if (typeof event.lastNotifiedDate === 'string') {
    payload.lastNotifiedDate = event.lastNotifiedDate;
  } else if (typeof current.lastNotifiedDate === 'string') {
    payload.lastNotifiedDate = current.lastNotifiedDate;
  }

  if (!existing.data.length) {
    await db.collection('users').add({
      data: {
        openid,
        ...payload,
        createdAt: now
      }
    });
  } else {
    await db.collection('users').doc(existing.data[0]._id).update({
      data: payload
    });
  }

  return {
    success: true,
    openid
  };
};
