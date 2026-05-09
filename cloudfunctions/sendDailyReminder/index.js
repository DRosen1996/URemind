const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const BATCH_SIZE = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CYCLE_LENGTH = 28;
const PILL_DAYS = 21;
const DEFAULT_TEMPLATE_ID = 'replace-with-your-subscribe-template-id';

function toDateOnly(dateInput) {
  const date = new Date(dateInput);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatYmd(dateInput = new Date()) {
  const date = toDateOnly(dateInput);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calcCycleStatus(cycleStartDate, currentDate = new Date()) {
  const start = toDateOnly(cycleStartDate);
  const current = toDateOnly(currentDate);
  const diffDays = Math.floor((current.getTime() - start.getTime()) / ONE_DAY_MS);
  const dayIndex = ((diffDays % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH + 1;
  const isPillDay = dayIndex <= PILL_DAYS;
  const breakDayIndex = isPillDay ? 0 : dayIndex - PILL_DAYS;
  return { dayIndex, isPillDay, breakDayIndex };
}

function minutesFromTime(remindTime = '21:00') {
  const [hour, minute] = remindTime.split(':').map(Number);
  return hour * 60 + minute;
}

function shouldSendToday(remindTime, currentDate) {
  const nowMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
  return nowMinutes >= minutesFromTime(remindTime);
}

async function writeNotifyLog(data) {
  try {
    await db.collection('notify_logs').add({ data });
  } catch (error) {
    console.error('写入 notify_logs 失败', error);
  }
}

async function handleUser(user, now, todayYmd, templateId) {
  if (!user.subscriptionAccepted || user.status !== 'active' || !user.cycleStartDate) {
    return { skipped: true, reason: 'not_ready' };
  }
  if (!shouldSendToday(user.remindTime, now)) {
    return { skipped: true, reason: 'before_time' };
  }
  if (user.lastNotifiedDate === todayYmd) {
    return { skipped: true, reason: 'already_sent' };
  }

  const cycle = calcCycleStatus(user.cycleStartDate, now);
  const thing = cycle.isPillDay
    ? `今天第${cycle.dayIndex}天，请按时服用优思明`
    : `今天停药第${cycle.breakDayIndex}天，无需服药`;

  try {
    await cloud.openapi.subscribeMessage.send({
      touser: user.openid,
      templateId,
      page: 'pages/index/index',
      data: {
        thing1: { value: thing.slice(0, 20) },
        date2: { value: `${todayYmd} ${user.remindTime}` },
        thing3: { value: cycle.isPillDay ? '吃药期' : '停药期' }
      },
      miniprogramState: 'formal'
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
  let total = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let offset = 0;

  while (true) {
    const result = await db.collection('users')
      .where({ status: 'active' })
      .skip(offset)
      .limit(BATCH_SIZE)
      .get();

    const users = result.data || [];
    if (!users.length) {
      break;
    }

    for (const user of users) {
      total += 1;
      const handleResult = await handleUser(user, now, todayYmd, templateId);
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

  return {
    success: true,
    day: todayYmd,
    total,
    sent,
    skipped,
    failed
  };
};
