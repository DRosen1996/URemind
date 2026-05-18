const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function getErrorDetails(error) {
  return {
    errCode: error && error.errCode,
    errMsg: error && error.errMsg,
    message: error && error.message,
    stack: error && error.stack
  };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const now = new Date();

  console.log('[saveUserConfig] start', {
    openid,
    event
  });

  try {
    const existing = await db.collection('users').where({ openid }).limit(1).get();
    const current = existing.data[0] || {};

    console.log('[saveUserConfig] current record', {
      openid,
      exists: !!existing.data.length,
      current
    });

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

    console.log('[saveUserConfig] payload before normalize', {
      openid,
      payload: { ...payload }
    });

    if (!payload.reminderEnabled) {
      payload.subscriptionAccepted = false;
    }

    if (typeof event.lastNotifiedDate === 'string') {
      payload.lastNotifiedDate = event.lastNotifiedDate;
    } else if (typeof current.lastNotifiedDate === 'string') {
      payload.lastNotifiedDate = current.lastNotifiedDate;
    }

    console.log('[saveUserConfig] payload after normalize', {
      openid,
      payload
    });

    if (!existing.data.length) {
      const addPayload = {
        openid,
        ...payload,
        createdAt: now
      };

      console.log('[saveUserConfig] add record', addPayload);

      await db.collection('users').add({
        data: addPayload
      });
    } else {
      console.log('[saveUserConfig] update record', {
        docId: existing.data[0]._id,
        payload
      });

      await db.collection('users').doc(existing.data[0]._id).update({
        data: payload
      });
    }

    console.log('[saveUserConfig] success', {
      openid
    });

    return {
      success: true,
      openid
    };
  } catch (error) {
    console.error('[saveUserConfig] failed', {
      openid,
      event,
      error,
      errorDetails: getErrorDetails(error)
    });
    throw error;
  }
};
