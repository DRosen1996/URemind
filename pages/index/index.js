const { calcCycleStatus, toYmd, CYCLE_LENGTH, PILL_DAYS } = require('../../utils/cycle');
const { loadUserConfig, saveUserConfig } = require('../../utils/user-config');

function buildCycleDots(cycle) {
  const dots = [];
  for (let i = 1; i <= CYCLE_LENGTH; i++) {
    let status;
    if (!cycle.hasStarted) {
      status = i <= PILL_DAYS ? 'future-pill' : 'future-break';
    } else if (i < cycle.dayIndex) {
      status = i <= PILL_DAYS ? 'done-pill' : 'done-break';
    } else if (i === cycle.dayIndex) {
      status = cycle.isPillDay ? 'today-pill' : 'today-break';
    } else {
      status = i <= PILL_DAYS ? 'future-pill' : 'future-break';
    }
    dots.push({ i, status });
  }
  return dots;
}

function getErrorDetails(error) {
  return {
    errCode: error && error.errCode,
    errMsg: error && error.errMsg,
    message: error && error.message,
    stack: error && error.stack
  };
}

Page({
  data: {
    cycleStartDate: '',
    remindTime: '21:00',
    savedRemindTime: '21:00',
    remindTimePending: false,
    reminderEnabled: false,
    subscriptionAccepted: false,
    hasStarted: false,
    daysUntilStart: 0,
    dayIndex: 0,
    isPillDay: true,
    phaseText: '请先设置周期开始日',
    statusDesc: '',
    cycleDots1: [],
    cycleDots2: []
  },

  async onShow() {
    await this.refreshConfig();
    if (this.data.reminderEnabled) {
      await this.autoRequestSubscribe();
    }
  },

  async autoRequestSubscribe() {
    const todayYmd = toYmd(new Date());
    try {
      const lastDate = wx.getStorageSync('lastAutoSubscribeDate');
      if (lastDate === todayYmd) {
        console.log('[autoSubscribe] already requested today, skip');
        return;
      }
    } catch (e) { /* ignore storage error */ }

    const app = getApp();
    const templateId = app.globalData.subscribeTemplateId;
    console.log('[autoSubscribe] start', { templateId, todayYmd });
    try {
      const result = await wx.requestSubscribeMessage({ tmplIds: [templateId] });
      const accepted = result[templateId] === 'accept';
      console.log('[autoSubscribe] result', { accepted });
      if (accepted) {
        wx.setStorageSync('lastAutoSubscribeDate', todayYmd);
      }
    } catch (error) {
      console.log('[autoSubscribe] dismissed or failed', error);
    }
  },

  async refreshConfig() {
    const config = await loadUserConfig();
    const cycleStartDate = config.cycleStartDate || toYmd(new Date());
    const cycle = calcCycleStatus(cycleStartDate, new Date());

    const dots = buildCycleDots(cycle);
    const savedRemindTime = config.remindTime || '21:00';
    this.setData({
      cycleStartDate,
      remindTime: savedRemindTime,
      savedRemindTime,
      remindTimePending: false,
      reminderEnabled: !!config.reminderEnabled,
      subscriptionAccepted: !!config.subscriptionAccepted,
      hasStarted: cycle.hasStarted,
      daysUntilStart: cycle.daysUntilStart,
      dayIndex: cycle.dayIndex,
      isPillDay: cycle.isPillDay,
      phaseText: cycle.phaseText,
      statusDesc: cycle.hasStarted
        ? (cycle.isPillDay ? '请按时服用优思明' : '今日无需服药')
        : '周期尚未开始，今天无需服药',
      cycleDots1: dots.slice(0, 14),
      cycleDots2: dots.slice(14)
    });
  },

  async onCycleDateChange(e) {
    const cycleStartDate = e.detail.value;
    const cycle = calcCycleStatus(cycleStartDate, new Date());
    const dots = buildCycleDots(cycle);
    this.setData({
      cycleStartDate,
      hasStarted: cycle.hasStarted,
      daysUntilStart: cycle.daysUntilStart,
      dayIndex: cycle.dayIndex,
      isPillDay: cycle.isPillDay,
      phaseText: cycle.phaseText,
      statusDesc: cycle.hasStarted
        ? (cycle.isPillDay ? '请按时服用优思明' : '今日无需服药')
        : '周期尚未开始，今天无需服药',
      cycleDots1: dots.slice(0, 14),
      cycleDots2: dots.slice(14)
    });
    try {
      await saveUserConfig({
        cycleStartDate,
        remindTime: this.data.remindTime,
        reminderEnabled: this.data.reminderEnabled,
        subscriptionAccepted: this.data.subscriptionAccepted
      });
      wx.showToast({ title: `周期已设为 ${cycleStartDate}`, icon: 'success', duration: 1500 });
    } catch (err) {
      wx.showToast({ title: '保存失败，请重试', icon: 'error' });
    }
  },

  onRemindTimeChange(e) {
    const remindTime = e.detail.value;
    this.setData({
      remindTime,
      remindTimePending: remindTime !== this.data.savedRemindTime
    });
  },

  async requestSubscribe() {
    const app = getApp();
    const startTime = Date.now();
    const templateId = app.globalData.subscribeTemplateId;
    const { remindTime, cycleStartDate, reminderEnabled, savedRemindTime, remindTimePending } = this.data;
    const isFirstTime = !reminderEnabled;
    const needsSave = isFirstTime || remindTimePending;

    console.log('[subscribe] start', {
      templateId, reminderEnabled, remindTime, remindTimePending, isFirstTime, needsSave
    });

    try {
      const result = await wx.requestSubscribeMessage({ tmplIds: [templateId] });
      const accepted = result[templateId] === 'accept';

      console.log('[subscribe] wx.requestSubscribeMessage result', {
        templateId, result, accepted, durationMs: Date.now() - startTime
      });

      if (!accepted) {
        if (remindTimePending) {
          this.setData({ remindTime: savedRemindTime, remindTimePending: false });
        }
        wx.showToast({ title: '未完成授权，设置未保存', icon: 'none' });
        return;
      }

      wx.setStorageSync('lastAutoSubscribeDate', toYmd(new Date()));

      if (needsSave) {
        const savePayload = {
          cycleStartDate,
          remindTime,
          reminderEnabled: true,
          subscriptionAccepted: true,
          lastNotifiedDate: ''
        };
        console.log('[subscribe] saveUserConfig payload', savePayload);
        try {
          const saveRes = await saveUserConfig(savePayload);
          console.log('[subscribe] saveUserConfig result', { saveRes, durationMs: Date.now() - startTime });
        } catch (saveError) {
          console.error('[subscribe] saveUserConfig failed', { saveError, errorDetails: getErrorDetails(saveError) });
          wx.showToast({ title: '保存失败，请重试', icon: 'error' });
          return;
        }
      }

      this.setData({
        reminderEnabled: true,
        subscriptionAccepted: true,
        savedRemindTime: remindTime,
        remindTimePending: false
      });

      const toastTitle = isFirstTime ? '提醒已开启' : (remindTimePending ? '提醒时间已更新' : '今日提醒已授权');
      wx.showToast({ title: toastTitle, icon: 'success' });
    } catch (error) {
      console.error('[subscribe] request failed', {
        templateId, durationMs: Date.now() - startTime, error, errorDetails: getErrorDetails(error)
      });
      if (remindTimePending) {
        this.setData({ remindTime: savedRemindTime, remindTimePending: false });
      }
      if (isFirstTime) {
        this.setData({ reminderEnabled: false, subscriptionAccepted: false });
        try {
          await saveUserConfig({ reminderEnabled: false, subscriptionAccepted: false });
        } catch (saveError) {
          console.error('[subscribe] save fallback failed', { saveError, errorDetails: getErrorDetails(saveError) });
        }
      }
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  goSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  }
});
