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
  const currentReminderEnabled = typeof current.reminderEnabled === 'boolean'
    ? current.reminderEnabled
    : (current.status === 'active' && !!current.subscriptionAccepted);

  const nextSubscriptionAccepted = typeof event.subscriptionAccepted === 'boolean'
    ? event.subscriptionAccepted
    : !!current.subscriptionAccepted;

  const nextReminderEnabled = typeof event.reminderEnabled === 'boolean'
    ? event.reminderEnabled
    : currentReminderEnabled;

  const payload = {
    cycleStartDate: typeof event.cycleStartDate === 'string' ? event.cycleStartDate : (current.cycleStartDate || ''),
    remindTime: typeof event.remindTime === 'string' ? event.remindTime : (current.remindTime || '21:00'),
    timezone: typeof event.timezone === 'string' ? event.timezone : (current.timezone || 'Asia/Shanghai'),
    subscriptionAccepted: nextSubscriptionAccepted,
    reminderEnabled: nextReminderEnabled,
    status: typeof event.status === 'string' ? event.status : (nextReminderEnabled ? 'active' : 'paused'),
    updatedAt: now
  };

  if (!payload.reminderEnabled) {
    payload.subscriptionAccepted = false;
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
