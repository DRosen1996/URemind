const { calcCycleStatus, toYmd, CYCLE_LENGTH, PILL_DAYS } = require('../../utils/cycle');
const { loadUserConfig, saveUserConfig } = require('../../utils/user-config');
const { readUserConfigCache, writeUserConfigCache } = require('../../utils/user-config-cache');

const AUTO_SUBSCRIBE_DELAY_MS = 400;

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
  _hasShownOnce: false,
  _subscribeTimer: null,

  data: {
    skeletonDots: Array.from({ length: 14 }, (_, i) => i),
    configReady: false,
    pageEnter: false,
    dotsAnimate: false,
    cycleStartDate: '',
    remindTime: '21:00',
    savedRemindTime: '21:00',
    remindTimePending: false,
    reminderEnabled: false,
    subscriptionAccepted: false,
    subscribedToday: false,
    hasStarted: false,
    daysUntilStart: 0,
    dayIndex: 0,
    isPillDay: true,
    phaseText: '',
    statusDesc: '',
    cycleDots1: [],
    cycleDots2: [],
    skeletonDots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  },

  _buildPageState(config) {
    const cycleStartDate = config.cycleStartDate || toYmd(new Date());
    const cycle = calcCycleStatus(cycleStartDate, new Date());
    const dots = buildCycleDots(cycle);
    const savedRemindTime = config.remindTime || '21:00';

    return {
      cycleStartDate,
      remindTime: savedRemindTime,
      savedRemindTime,
      remindTimePending: false,
      reminderEnabled: !!config.reminderEnabled,
      subscriptionAccepted: !!config.subscriptionAccepted,
      subscribedToday: this._checkSubscribedToday(),
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
    };
  },

  _cachePayloadFromState(state) {
    return {
      cycleStartDate: state.cycleStartDate,
      remindTime: state.remindTime,
      reminderEnabled: state.reminderEnabled,
      subscriptionAccepted: state.subscriptionAccepted
    };
  },

  async onShow() {
    const silent = this._hasShownOnce;
    await this.refreshConfig({ silent });
    this._scheduleAutoSubscribe();
  },

  onUnload() {
    if (this._subscribeTimer) {
      clearTimeout(this._subscribeTimer);
      this._subscribeTimer = null;
    }
  },

  _scheduleAutoSubscribe() {
    if (this._subscribeTimer) {
      clearTimeout(this._subscribeTimer);
    }
    if (!this.data.reminderEnabled) {
      return;
    }
    this._subscribeTimer = setTimeout(() => {
      this._subscribeTimer = null;
      this.autoRequestSubscribe();
    }, AUTO_SUBSCRIBE_DELAY_MS);
  },

  _checkSubscribedToday() {
    const todayYmd = toYmd(new Date());
    try {
      return wx.getStorageSync('lastAutoSubscribeDate') === todayYmd;
    } catch (e) {
      return false;
    }
  },

  async autoRequestSubscribe() {
    const todayYmd = toYmd(new Date());
    try {
      const lastDate = wx.getStorageSync('lastAutoSubscribeDate');
      if (lastDate === todayYmd) {
        console.log('[autoSubscribe] already requested today, skip');
        this.setData({ subscribedToday: true });
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
        this.setData({ subscribedToday: true });
      }
    } catch (error) {
      console.log('[autoSubscribe] dismissed or failed', error);
    }
  },

  async refreshConfig({ silent = false } = {}) {
    const isFirstShow = !this._hasShownOnce;
    const cache = readUserConfigCache();
    let showedCacheEarly = false;

    if (isFirstShow && !silent) {
      if (!cache) {
        this.setData({ configReady: false, pageEnter: false, dotsAnimate: false });
      } else {
        showedCacheEarly = true;
        const cachedState = this._buildPageState(cache);
        this.setData({
          ...cachedState,
          configReady: true,
          pageEnter: false,
          dotsAnimate: false
        });
      }
    }

    try {
      const config = await loadUserConfig();
      const pageState = this._buildPageState(config);
      writeUserConfigCache(this._cachePayloadFromState(pageState));

      const enterPatch = isFirstShow && !showedCacheEarly
        ? { pageEnter: true, dotsAnimate: true }
        : {};

      this.setData({
        ...pageState,
        configReady: true,
        ...enterPatch
      });

      if (isFirstShow) {
        this._hasShownOnce = true;
      }
    } catch (error) {
      console.error('[refreshConfig] failed', { error, errorDetails: getErrorDetails(error) });
      if (!silent && !cache) {
        wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      }
      this.setData({ configReady: true });
      if (isFirstShow) {
        this._hasShownOnce = true;
      }
    }
  },

  async onCycleDateChange(e) {
    const cycleStartDate = e.detail.value;
    const cycle = calcCycleStatus(cycleStartDate, new Date());
    const dots = buildCycleDots(cycle);
    const pageState = {
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
    };
    this.setData(pageState);
    try {
      await saveUserConfig({
        cycleStartDate,
        remindTime: this.data.remindTime,
        reminderEnabled: this.data.reminderEnabled,
        subscriptionAccepted: this.data.subscriptionAccepted
      });
      writeUserConfigCache({
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

      const nextState = {
        reminderEnabled: true,
        subscriptionAccepted: true,
        savedRemindTime: remindTime,
        remindTimePending: false,
        subscribedToday: true
      };
      this.setData(nextState);
      writeUserConfigCache({
        cycleStartDate,
        remindTime,
        reminderEnabled: true,
        subscriptionAccepted: true
      });

      const toastTitle = isFirstTime ? '提醒已开启' : (needsSave && remindTimePending ? '提醒时间已更新' : '今日提醒已授权');
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
          writeUserConfigCache({ reminderEnabled: false, subscriptionAccepted: false });
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
