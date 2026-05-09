// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }

    wx.cloud.init({
      env: 'replace-with-your-cloud-env-id',
      traceUser: true
    });
  },
  globalData: {
    timezone: 'Asia/Shanghai',
    subscribeTemplateId: 'replace-with-your-subscribe-template-id'
  }
});
