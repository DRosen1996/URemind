const COLLECTION = 'users';

function maskOpenId(openid) {
  if (!openid || typeof openid !== 'string') {
    return openid;
  }
  if (openid.length <= 10) {
    return openid;
  }
  return `${openid.slice(0, 4)}***${openid.slice(-4)}`;
}

function getErrorDetails(error) {
  return {
    errCode: error && error.errCode,
    errMsg: error && error.errMsg,
    message: error && error.message,
    stack: error && error.stack
  };
}

function resolveCallFunctionResult(res) {
  const result = res && res.result;

  if (!result || typeof result !== 'object') {
    return {};
  }

  if (typeof result.openid === 'string' || typeof result.appid === 'string') {
    return result;
  }

  if (result.result && typeof result.result === 'object') {
    return result.result;
  }

  if (result.data && typeof result.data === 'object') {
    return result.data;
  }

  return result;
}

function getOpenId() {
  console.log('[user-config] getOpenId start');
  return wx.cloud.callFunction({
    name: 'getOpenId'
  }).then((res) => {
    const parsedResult = resolveCallFunctionResult(res);

    console.log('[user-config] getOpenId raw response', res);
    console.log('[user-config] getOpenId parsed result', {
      openid: maskOpenId(parsedResult.openid),
      appid: parsedResult.appid,
      keys: Object.keys(parsedResult)
    });

    if (!parsedResult.openid) {
      const error = new Error('getOpenId returned empty openid');

      console.error('[user-config] getOpenId missing openid', {
        rawResponse: res,
        parsedResult
      });

      throw error;
    }

    return parsedResult.openid;
  }).catch((error) => {
    console.error('[user-config] getOpenId failed', {
      error,
      errorDetails: getErrorDetails(error)
    });
    throw error;
  });
}

async function loadUserConfig() {
  const openid = await getOpenId();
  const db = wx.cloud.database();

  if (!openid) {
    throw new Error('[user-config] openid is empty before db query');
  }

  console.log('[user-config] load start', {
    openid: maskOpenId(openid)
  });

  const result = await db.collection(COLLECTION).where({ openid }).limit(1).get();

  console.log('[user-config] load raw result', {
    openid: maskOpenId(openid),
    count: result.data.length,
    data: result.data
  });

  if (!result.data.length) {
    const defaultConfig = {
      openid,
      cycleStartDate: '',
      remindTime: '21:00',
      timezone: 'Asia/Shanghai',
      reminderEnabled: false,
      subscriptionAccepted: false,
      status: 'active'
    };

    console.log('[user-config] load default config', {
      ...defaultConfig,
      openid: maskOpenId(openid)
    });

    return defaultConfig;
  }

  const config = result.data[0];
  const reminderEnabled = typeof config.reminderEnabled === 'boolean'
    ? config.reminderEnabled
    : (config.status === 'active' && !!config.subscriptionAccepted);

  const finalConfig = {
    ...config,
    reminderEnabled
  };

  console.log('[user-config] load final config', {
    ...finalConfig,
    openid: maskOpenId(finalConfig.openid)
  });

  return finalConfig;
}

function saveUserConfig(data) {
  console.log('[user-config] save start', data);
  return wx.cloud.callFunction({
    name: 'saveUserConfig',
    data
  }).then((res) => {
    console.log('[user-config] save result', {
      requestData: data,
      result: res.result
    });
    return res;
  }).catch((error) => {
    console.error('[user-config] save failed', {
      requestData: data,
      error,
      errorDetails: getErrorDetails(error)
    });
    throw error;
  });
}

module.exports = {
  loadUserConfig,
  saveUserConfig
};
