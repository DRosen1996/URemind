const { loadUserConfig, saveUserConfig } = require('../../utils/user-config');
const { toYmd } = require('../../utils/cycle');

Page({
  data: {
    status: 'active'
  },
  async onShow() {
    const config = await loadUserConfig();
    this.setData({
      status: config.status || 'active'
    });
  },
  async onStatusChange(e) {
    const status = e.detail.value ? 'active' : 'paused';
    this.setData({ status });
    await saveUserConfig({ status });
    wx.showToast({
      title: status === 'active' ? '提醒已开启' : '提醒已暂停',
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
