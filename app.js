// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }

    wx.cloud.init({
      env: 'cloud1-d5gz8xnc51e291b79',
      traceUser: true
    });
  },
  globalData: {
    timezone: 'Asia/Shanghai',
    subscribeTemplateId: 'quh9oId5A5RAI7IvAeXndh5EIw-eYGRIRnpFt2upc84'
  }
});
