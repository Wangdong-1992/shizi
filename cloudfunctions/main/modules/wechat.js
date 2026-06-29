/**
 * modules/wechat.js
 *
 * 微信小程序服务端 API 封装 (code 换 openid / access_token / 订阅消息).
 *
 * 抽取自 cloudfunctions/main/index.js, 减少主入口体积.
 * 注: ES5 风格 (var + function declaration) 跟主仓库一致.
 */

const https = require('https');

/**
 * 用 code 换 openid (微信 jscode2session)
 * @param {string} WX_APPID
 * @param {string} WX_APPSECRET
 * @param {string} code - 微信 code (5 分钟过期)
 * @returns {Promise<string|null>} openid, 失败返回 null
 */
function code2openid(WX_APPID, WX_APPSECRET, code) {
  return new Promise(function (resolve) {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_APPSECRET}&js_code=${code}&grant_type=authorization_code`;

    const req = https.get(url, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          const result = JSON.parse(data);
          if (result.openid) {
            resolve(result.openid);
          } else {
            console.error('code2openid failed:', result);
            resolve(null);
          }
        } catch (e) {
          console.error('code2openid parse error:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', function (err) {
      console.error('code2openid network error:', err.message);
      resolve(null);
    });

    req.setTimeout(5000, function () {
      console.error('code2openid timeout');
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * 获取微信 access_token (进程内缓存, 提前 5 分钟续期)
 *
 * 返回一个工厂函数, 闭包持有缓存变量, 每个 cloud function 实例独立缓存.
 * 多实例部署时不同实例各拿各的 access_token, 不会互相冲突 (微信 access_token
 * 本身有 7200s 有效期, 多实例各拿各的是预期行为).
 */
function createWxAccessTokenFetcher(WX_APPID, WX_APPSECRET) {
  let cachedToken = null;
  let cachedExpire = 0;

  return function fetchWxAccessToken() {
    return new Promise(function (resolve, reject) {
      if (cachedToken && Date.now() < cachedExpire) {
        return resolve(cachedToken);
      }
      const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_APPSECRET}`;
      https.get(url, function (res) {
        let data = '';
        res.on('data', function (chunk) { data += chunk; });
        res.on('end', function () {
          try {
            const result = JSON.parse(data);
            if (result.access_token) {
              cachedToken = result.access_token;
              cachedExpire = Date.now() + (result.expires_in - 300) * 1000;
              resolve(cachedToken);
            } else {
              reject(new Error('获取微信 access_token 失败: ' + JSON.stringify(result)));
            }
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  };
}

/**
 * 发送微信服务通知 (R-15)
 * @param {string} accessToken
 * @param {string} openid
 * @param {object} message - {template_id, page, data}
 * @returns {Promise<object>}
 */
function sendSubscribeMessage(accessToken, openid, message) {
  return new Promise(function (resolve, reject) {
    var postData = JSON.stringify({
      touser: openid,
      template_id: message.template_id,
      page: message.page || '',
      data: message.data || {},
      miniprogram_state: 'formal'
    });
    var url = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + accessToken;
    var req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, function (res) {
      var body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = {
  code2openid: code2openid,
  createWxAccessTokenFetcher: createWxAccessTokenFetcher,
  sendSubscribeMessage: sendSubscribeMessage
};