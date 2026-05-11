const { loadUserConfig, saveUserConfig } = require('../../utils/user-config');
const { toYmd } = require('../../utils/cycle');

Page({
  data: {
    reminderEnabled: false,
    subscriptionAccepted: false
  },
  async onShow() {
    const config = await loadUserConfig();
    this.setData({
      reminderEnabled: !!config.reminderEnabled,
      subscriptionAccepted: !!config.subscriptionAccepted
    });
  },
  async onStatusChange(e) {
    const nextEnabled = e.detail.value;
    if (nextEnabled) {
      this.setData({
        reminderEnabled: false
      });
      wx.showToast({
        title: '请回首页开启订阅提醒',
        icon: 'none'
      });
      return;
    }

    this.setData({
      reminderEnabled: false,
      subscriptionAccepted: false
    });
    await saveUserConfig({
      reminderEnabled: false,
      subscriptionAccepted: false,
      status: 'paused'
    });
    wx.showToast({
      title: '提醒已关闭',
      icon: 'none'
    });
  },
  async onResetCycle() {
    const cycleStartDate = toYmd(new Date());
    await saveUserConfig({
      cycleStartDate,
      reminderEnabled: this.data.reminderEnabled,
      subscriptionAccepted: this.data.subscriptionAccepted
    });
    wx.showToast({
      title: '已重置为今天',
      icon: 'none'
    });
  }
});
