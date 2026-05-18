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
  },

  async refreshConfig() {
    const config = await loadUserConfig();
    const cycleStartDate = config.cycleStartDate || toYmd(new Date());
    const cycle = calcCycleStatus(cycleStartDate, new Date());

    const dots = buildCycleDots(cycle);
    this.setData({
      cycleStartDate,
      remindTime: config.remindTime || '21:00',
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
    await saveUserConfig({
      cycleStartDate,
      remindTime: this.data.remindTime,
      reminderEnabled: this.data.reminderEnabled,
      subscriptionAccepted: this.data.subscriptionAccepted
    });
  },

  async onRemindTimeChange(e) {
    const remindTime = e.detail.value;
    this.setData({ remindTime });
    await saveUserConfig({
      cycleStartDate: this.data.cycleStartDate,
      remindTime,
      reminderEnabled: this.data.reminderEnabled,
      subscriptionAccepted: this.data.subscriptionAccepted
    });
  },

  async requestSubscribe() {
    if (this.data.reminderEnabled) {
      console.log('[subscribe] skip because already enabled', {
        reminderEnabled: this.data.reminderEnabled,
        subscriptionAccepted: this.data.subscriptionAccepted
      });
      wx.showToast({
        title: '提醒已开启',
        icon: 'none'
      });
      return;
    }

    const app = getApp();
    const startTime = Date.now();
    const templateId = app.globalData.subscribeTemplateId;

    console.log('[subscribe] start', {
      templateId,
      pageData: {
        cycleStartDate: this.data.cycleStartDate,
        remindTime: this.data.remindTime,
        reminderEnabled: this.data.reminderEnabled,
        subscriptionAccepted: this.data.subscriptionAccepted
      }
    });

    try {
      const result = await wx.requestSubscribeMessage({
        tmplIds: [templateId]
      });
      const accepted = result[templateId] === 'accept';

      console.log('[subscribe] wx.requestSubscribeMessage result', {
        templateId,
        result,
        accepted,
        durationMs: Date.now() - startTime
      });

      this.setData({
        reminderEnabled: accepted,
        subscriptionAccepted: accepted
      });

      const savePayload = {
        cycleStartDate: this.data.cycleStartDate,
        remindTime: this.data.remindTime,
        reminderEnabled: accepted,
        subscriptionAccepted: accepted
      };

      console.log('[subscribe] saveUserConfig payload', savePayload);

      const saveRes = await saveUserConfig(savePayload);

      console.log('[subscribe] saveUserConfig result', {
        saveRes,
        durationMs: Date.now() - startTime
      });

      wx.showToast({
        title: accepted ? '提醒已开启' : '提醒未开启',
        icon: 'none'
      });
    } catch (error) {
      const fallbackPayload = {
        reminderEnabled: false,
        subscriptionAccepted: false
      };

      console.error('[subscribe] request failed', {
        templateId,
        durationMs: Date.now() - startTime,
        error,
        errorDetails: getErrorDetails(error)
      });

      console.log('[subscribe] save fallback payload', fallbackPayload);

      try {
        const fallbackRes = await saveUserConfig(fallbackPayload);
        console.log('[subscribe] save fallback result', {
          fallbackRes,
          durationMs: Date.now() - startTime
        });
      } catch (saveError) {
        console.error('[subscribe] save fallback failed', {
          saveError,
          errorDetails: getErrorDetails(saveError)
        });
      }

      this.setData({
        reminderEnabled: false,
        subscriptionAccepted: false
      });
      wx.showToast({
        title: '提醒开启失败',
        icon: 'none'
      });
      console.error('[subscribe] final state reset after failure', {
        reminderEnabled: false,
        subscriptionAccepted: false
      });
    }
  },

  goSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  }
});
