const { calcCycleStatus, toYmd } = require('../../utils/cycle');
const { loadUserConfig, saveUserConfig } = require('../../utils/user-config');

Page({
  data: {
    cycleStartDate: '',
    remindTime: '21:00',
    subscriptionAccepted: false,
    hasStarted: false,
    daysUntilStart: 0,
    isPillDay: true,
    phaseText: '请先设置周期开始日',
    statusDesc: '',
    status: 'active',
    lastInAppReminderDate: ''
  },

  async onShow() {
    await this.refreshConfig();
    this.tryInAppFallbackReminder();
  },

  async refreshConfig() {
    const config = await loadUserConfig();
    const cycleStartDate = config.cycleStartDate || toYmd(new Date());
    const cycle = calcCycleStatus(cycleStartDate, new Date());

    this.setData({
      cycleStartDate,
      remindTime: config.remindTime || '21:00',
      subscriptionAccepted: !!config.subscriptionAccepted,
      hasStarted: cycle.hasStarted,
      daysUntilStart: cycle.daysUntilStart,
      isPillDay: cycle.isPillDay,
      phaseText: cycle.phaseText,
      statusDesc: cycle.hasStarted
        ? (cycle.isPillDay ? '请按时服用优思明' : '今日无需服药')
        : '周期尚未开始，今天不用小优',
      status: config.status || 'active',
      lastInAppReminderDate: config.lastInAppReminderDate || ''
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
        : '周期尚未开始，今天不用小优'
    });
    await saveUserConfig({
      cycleStartDate,
      remindTime: this.data.remindTime,
      subscriptionAccepted: this.data.subscriptionAccepted,
      status: this.data.status,
      lastInAppReminderDate: this.data.lastInAppReminderDate
    });
  },

  async onRemindTimeChange(e) {
    const remindTime = e.detail.value;
    this.setData({ remindTime });
    await saveUserConfig({
      cycleStartDate: this.data.cycleStartDate,
      remindTime,
      subscriptionAccepted: this.data.subscriptionAccepted,
      status: this.data.status,
      lastInAppReminderDate: this.data.lastInAppReminderDate
    });
  },

  async requestSubscribe() {
    const app = getApp();
    try {
      const templateId = app.globalData.subscribeTemplateId;
      const result = await wx.requestSubscribeMessage({
        tmplIds: [templateId]
      });
      const accepted = result[templateId] === 'accept';
      this.setData({
        subscriptionAccepted: accepted
      });
      await saveUserConfig({
        cycleStartDate: this.data.cycleStartDate,
        remindTime: this.data.remindTime,
        subscriptionAccepted: accepted,
        status: this.data.status,
        lastInAppReminderDate: this.data.lastInAppReminderDate
      });
      wx.showToast({
        title: accepted ? '订阅成功' : '订阅未开启',
        icon: 'none'
      });
    } catch (error) {
      wx.showToast({
        title: '订阅请求失败',
        icon: 'none'
      });
      console.error('订阅消息授权失败', error);
    }
  },

  async tryInAppFallbackReminder() {
    const today = toYmd(new Date());
    const [hour, minute] = this.data.remindTime.split(':').map(Number);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const remindMinutes = hour * 60 + minute;
    if (this.data.status !== 'active') {
      return;
    }
    if (!this.data.hasStarted) {
      return;
    }
    if (nowMinutes < remindMinutes) {
      return;
    }
    if (this.data.lastInAppReminderDate === today) {
      return;
    }

    wx.showModal({
      title: '今日提醒',
      content: this.data.isPillDay ? '到时间了，记得服用优思明。' : '今天是停药日，无需服药。',
      showCancel: false
    });

    this.setData({
      lastInAppReminderDate: today
    });
    await saveUserConfig({
      cycleStartDate: this.data.cycleStartDate,
      remindTime: this.data.remindTime,
      subscriptionAccepted: this.data.subscriptionAccepted,
      status: this.data.status,
      lastInAppReminderDate: today
    });
  },

  goSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  }
});
