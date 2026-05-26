const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const BATCH_SIZE = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8
const CYCLE_LENGTH = 28;
const PILL_DAYS = 21;
// 与小程序 app.globalData.subscribeTemplateId 保持一致（打卡提醒：thing4 + time13）
const DEFAULT_TEMPLATE_ID = 'quh9oId5A5RAI7IvAeXndh5EIw-eYGRIRnpFt2upc84';
const THING_MAX_LEN = 20;

function getErrorDetails(error) {
  return {
    errCode: error && error.errCode,
    errMsg: error && error.errMsg,
    message: error && error.message,
    stack: error && error.stack
  };
}

function truncateThing(text) {
  const s = String(text || '').trim();
  return s.length > THING_MAX_LEN ? s.slice(0, THING_MAX_LEN) : s;
}

function buildThing4(cycle) {
  if (!cycle.hasStarted) {
    return '';
  }
  if (cycle.isPillDay) {
    return truncateThing(`优思明第${cycle.dayIndex}天请服药`);
  }
  return truncateThing(`优思明停药第${cycle.breakDayIndex}天`);
}

// 将任意时间转为北京时间（UTC+8）表示的 Date 对象，用 getUTC* 方法读取北京各字段
function toBeijingDate(dateInput) {
  return new Date(new Date(dateInput).getTime() + BEIJING_OFFSET_MS);
}

function toDateOnly(dateInput) {
  const bj = toBeijingDate(dateInput);
  // 以北京年月日构造 UTC midnight，保证日期差计算不受时区影响
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), bj.getUTCDate()));
}

function formatYmd(dateInput = new Date()) {
  const bj = toBeijingDate(dateInput);
  const year = bj.getUTCFullYear();
  const month = `${bj.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${bj.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calcCycleStatus(cycleStartDate, currentDate = new Date()) {
  const start = toDateOnly(cycleStartDate);
  const current = toDateOnly(currentDate);
  const diffDays = Math.floor((current.getTime() - start.getTime()) / ONE_DAY_MS);
  const hasStarted = diffDays >= 0;
  if (!hasStarted) {
    return {
      hasStarted: false,
      daysUntilStart: Math.abs(diffDays),
      dayIndex: 0,
      isPillDay: false,
      breakDayIndex: 0
    };
  }
  const dayIndex = ((diffDays % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH + 1;
  const isPillDay = dayIndex <= PILL_DAYS;
  const breakDayIndex = isPillDay ? 0 : dayIndex - PILL_DAYS;
  return {
    hasStarted: true,
    daysUntilStart: 0,
    dayIndex,
    isPillDay,
    breakDayIndex
  };
}

function minutesFromTime(remindTime = '21:00') {
  const [hour, minute] = remindTime.split(':').map(Number);
  return hour * 60 + minute;
}

function getBeijingMinutes(currentDate) {
  const bj = toBeijingDate(currentDate);
  return bj.getUTCHours() * 60 + bj.getUTCMinutes();
}

function formatMinutesAsTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function shouldSendToday(remindTime, currentDate) {
  return getBeijingMinutes(currentDate) >= minutesFromTime(remindTime);
}

async function writeNotifyLog(data) {
  try {
    console.log('[sendDailyReminder] write notify log', data);
    await db.collection('notify_logs').add({ data });
  } catch (error) {
    console.error('[sendDailyReminder] write notify log failed', {
      data,
      error,
      errorDetails: getErrorDetails(error)
    });
  }
}

async function handleUser(user, now, todayYmd, templateId, miniprogramState) {
  const reminderEnabled = typeof user.reminderEnabled === 'boolean'
    ? user.reminderEnabled
    : (user.status === 'active' && !!user.subscriptionAccepted);

  console.log('[sendDailyReminder] handle user start', {
    openid: user.openid,
    templateId,
    todayYmd,
    user: {
      cycleStartDate: user.cycleStartDate,
      remindTime: user.remindTime,
      reminderEnabled: user.reminderEnabled,
      subscriptionAccepted: user.subscriptionAccepted,
      status: user.status,
      lastNotifiedDate: user.lastNotifiedDate
    },
    derivedReminderEnabled: reminderEnabled
  });

  if (!reminderEnabled || !user.subscriptionAccepted || !user.cycleStartDate) {
    console.log('[sendDailyReminder] skip:not_ready', {
      openid: user.openid,
      reminderEnabled,
      subscriptionAccepted: user.subscriptionAccepted,
      cycleStartDate: user.cycleStartDate
    });
    return { skipped: true, reason: 'not_ready' };
  }
  if (!shouldSendToday(user.remindTime, now)) {
    console.log('[sendDailyReminder] skip:before_time', {
      openid: user.openid,
      now,
      remindTime: user.remindTime
    });
    return { skipped: true, reason: 'before_time' };
  }
  if (user.lastNotifiedDate === todayYmd) {
    console.log('[sendDailyReminder] skip:already_sent', {
      openid: user.openid,
      todayYmd,
      lastNotifiedDate: user.lastNotifiedDate
    });
    return { skipped: true, reason: 'already_sent' };
  }

  const cycle = calcCycleStatus(user.cycleStartDate, now);
  console.log('[sendDailyReminder] cycle result', {
    openid: user.openid,
    cycle
  });
  if (!cycle.hasStarted) {
    console.log('[sendDailyReminder] skip:before_cycle_start', {
      openid: user.openid,
      cycleStartDate: user.cycleStartDate,
      cycle
    });
    return { skipped: true, reason: 'before_cycle_start' };
  }
  const thing4Value = buildThing4(cycle);
  const time13Value = (user.remindTime || '21:00').trim();

  try {
    console.log('[sendDailyReminder] send payload', {
      openid: user.openid,
      templateId,
      page: 'pages/index/index',
      data: {
        thing4: thing4Value,
        time13: time13Value
      }
    });

    const sendRes = await cloud.openapi.subscribeMessage.send({
      touser: user.openid,
      templateId,
      page: 'pages/index/index',
      data: {
        thing4: { value: thing4Value },
        time13: { value: time13Value }
      },
      miniprogramState
    });

    console.log('[sendDailyReminder] send success', {
      openid: user.openid,
      sendRes
    });

    await db.collection('users').doc(user._id).update({
      data: {
        lastNotifiedDate: todayYmd,
        updatedAt: now
      }
    });

    await writeNotifyLog({
      openid: user.openid,
      day: todayYmd,
      remindTime: user.remindTime,
      success: true,
      cycleDayIndex: cycle.dayIndex,
      isPillDay: cycle.isPillDay,
      createdAt: now
    });

    return { success: true };
  } catch (error) {
    const errText = `${error.errCode || ''} ${error.message || ''}`;
    // 43101 = 用户订阅配额已耗尽（一次性订阅正常现象，不关闭提醒）
    // 其他订阅相关错误（如用户永久拒绝）才真正关闭
    const isQuotaExhausted = /43101/.test(errText);
    const shouldDisableReminder = !isQuotaExhausted && /template|subscribe|用户|accept/i.test(errText);

    console.error('[sendDailyReminder] send failed', {
      openid: user.openid,
      templateId,
      isQuotaExhausted,
      shouldDisableReminder,
      error,
      errorDetails: getErrorDetails(error)
    });

    if (shouldDisableReminder) {
      await db.collection('users').doc(user._id).update({
        data: {
          reminderEnabled: false,
          subscriptionAccepted: false,
          updatedAt: now
        }
      });
    }
    await writeNotifyLog({
      openid: user.openid,
      day: todayYmd,
      remindTime: user.remindTime,
      success: false,
      errorMessage: error.message,
      createdAt: now
    });
    return { success: false, error: error.message };
  }
}

exports.main = async (event) => {
  const now = new Date();
  const todayYmd = formatYmd(now);
  const templateId = event.templateId || DEFAULT_TEMPLATE_ID;
  const miniprogramState = event.miniprogramState || 'formal';
  let total = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let offset = 0;

  console.log('[sendDailyReminder] start', {
    event,
    now,
    nowBeijing: toBeijingDate(now).toISOString(),
    todayYmd,
    templateId
  });

  while (true) {
    const result = await db.collection('users')
      .skip(offset)
      .limit(BATCH_SIZE)
      .get();

    const users = result.data || [];
    console.log('[sendDailyReminder] batch fetched', {
      offset,
      count: users.length
    });
    if (!users.length) {
      break;
    }

    for (const user of users) {
      total += 1;
      const handleResult = await handleUser(user, now, todayYmd, templateId, miniprogramState);
      console.log('[sendDailyReminder] handle result', {
        openid: user.openid,
        handleResult
      });
      if (handleResult.success) {
        sent += 1;
      } else if (handleResult.skipped) {
        skipped += 1;
      } else {
        failed += 1;
      }
    }

    offset += users.length;
  }

  console.log('[sendDailyReminder] done', {
    day: todayYmd,
    total,
    sent,
    skipped,
    failed
  });

  return {
    success: true,
    day: todayYmd,
    total,
    sent,
    skipped,
    failed
  };
};
