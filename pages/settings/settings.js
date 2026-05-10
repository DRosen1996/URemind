const { loadUserConfig, saveUserConfig } = require('../../utils/user-config');
const { toYmd } = require('../../utils/cycle');

Page({
  data: {
    status: 'active',
    subscriptionAccepted: false
  },
  async onShow() {
    const config = await loadUserConfig();
    this.setData({
      status: config.status || 'active',
      subscriptionAccepted: !!config.subscriptionAccepted
    });
  },
  async onStatusChange(e) {
    const status = e.detail.value ? 'active' : 'paused';
    const subscriptionAccepted = status === 'active' ? this.data.subscriptionAccepted : false;
    this.setData({
      status,
      subscriptionAccepted
    });
    await saveUserConfig({
      status,
      subscriptionAccepted
    });
    wx.showToast({
      title: status === 'active' ? '提醒已开启' : '提醒与订阅已关闭',
      icon: 'none'
    });
  },
  async onResetCycle() {
    const cycleStartDate = toYmd(new Date());
    await saveUserConfig({ cycleStartDate, status: this.data.status });
    wx.showToast({
      title: '已重置为今天',
      icon: 'none'
    });
  }
});
