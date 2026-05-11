const { calcCycleStatus, toYmd } = require('../../utils/cycle');
const { loadUserConfig, saveUserConfig } = require('../../utils/user-config');

Page({
  data: {
    cycleStartDate: '',
    remindTime: '21:00',
    reminderEnabled: false,
    subscriptionAccepted: false,
    hasStarted: false,
    daysUntilStart: 0,
    isPillDay: true,
    phaseText: '请先设置周期开始日',
    statusDesc: ''
  },

  async onShow() {
    await this.refreshConfig();
  },

  async refreshConfig() {
    const config = await loadUserConfig();
    const cycleStartDate = config.cycleStartDate || toYmd(new Date());
    const cycle = calcCycleStatus(cycleStartDate, new Date());

    this.setData({
      cycleStartDate,
      remindTime: config.remindTime || '21:00',
      reminderEnabled: !!config.reminderEnabled,
      subscriptionAccepted: !!config.subscriptionAccepted,
      hasStarted: cycle.hasStarted,
      daysUntilStart: cycle.daysUntilStart,
      isPillDay: cycle.isPillDay,
      phaseText: cycle.phaseText,
      statusDesc: cycle.hasStarted
        ? (cycle.isPillDay ? '请按时服用优思明' : '今日无需服药')
        : '周期尚未开始，今天无需服药'
    });
  },

  async onCycleDateChange(e) {
    const cycleStartDate = e.detail.value;
    const cycle = calcCycleStatus(cycleStartDate, new Date());
    this.setData({
      cycleStartDate,
      hasStarted: cycle.hasStarted,
      daysUntilStart: cycle.daysUntilStart,
      isPillDay: cycle.isPillDay,
      phaseText: cycle.phaseText,
      statusDesc: cycle.hasStarted
        ? (cycle.isPillDay ? '请按时服用优思明' : '今日无需服药')
        : '周期尚未开始，今天无需服药'
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
      wx.showToast({
        title: '提醒已开启',
        icon: 'none'
      });
      return;
    }

    const app = getApp();
    try {
      const templateId = app.globalData.subscribeTemplateId;
      const result = await wx.requestSubscribeMessage({
        tmplIds: [templateId]
      });
      const accepted = result[templateId] === 'accept';
      this.setData({
        reminderEnabled: accepted,
        subscriptionAccepted: accepted
      });
      await saveUserConfig({
        cycleStartDate: this.data.cycleStartDate,
        remindTime: this.data.remindTime,
        reminderEnabled: accepted,
        subscriptionAccepted: accepted
      });
      wx.showToast({
        title: accepted ? '提醒已开启' : '提醒未开启',
        icon: 'none'
      });
    } catch (error) {
      await saveUserConfig({
        reminderEnabled: false,
        subscriptionAccepted: false
      });
      this.setData({
        reminderEnabled: false,
        subscriptionAccepted: false
      });
      wx.showToast({
        title: '提醒开启失败',
        icon: 'none'
      });
      console.error('订阅消息授权失败', error);
    }
  },

  goSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  }
});
