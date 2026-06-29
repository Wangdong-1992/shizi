/**
 * modules/baidu.js
 *
 * 百度语音 API 封装: TTS / ASR / access_token 缓存 / URL cache / rate limit / 拼音相似度.
 *
 * 抽取自 cloudfunctions/main/index.js 的 getBaiduAccessToken / downloadFile /
 * baiduASR / TTS cache / rate limit / comparePinyin.
 *
 * 设计: 提供工厂函数 createBaiduClient(opts) 返回带缓存/限流的 client.
 * 多实例部署时, 每个 cloud function 实例独立缓存 access_token + TTS URL,
 * 不会互相冲突.
 *
 * 注: ES5 风格 (var + function declaration) 跟主仓库一致.
 */

const https = require('https');

/**
 * 创建百度语音 client
 * @param {object} opts
 * @param {string} opts.API_KEY - 百度 API Key
 * @param {string} opts.SECRET_KEY - 百度 Secret Key
 * @param {string} [opts.cuid=shizi] - 百度 cu id (用于计费区分)
 * @returns {object} baidu client
 */
function createBaiduClient(opts) {
  var apiKey = opts.API_KEY;
  var secretKey = opts.SECRET_KEY;
  var cuid = opts.cuid || 'shizi';

  // Access token 缓存
  var cachedToken = null;
  var tokenExpireAt = 0;

  // TTS URL 缓存 (key: 文本, value: { url, expiresAt })
  // 字符+拼音组合共 ~4500 种, 24h TTL 基本永久命中
  var ttsUrlCache = new Map();
  var TTS_CACHE_TTL = 24 * 60 * 60 * 1000;

  // Rate limit buckets (key: 'tts:' + ip 或 'asr:' + ip)
  var rateLimitBuckets = new Map();
  var RATE_LIMIT_WINDOW = 60 * 1000;
  var RATE_LIMIT_MAX_TTS = 60; // 每 IP 每分钟 60 次
  var RATE_LIMIT_MAX_ASR = 30; // ASR 更贵, 限更严

  function getCachedTtsUrl(text) {
    var hit = ttsUrlCache.get(text);
    if (hit && hit.expiresAt > Date.now()) return hit.url;
    return null;
  }

  function setCachedTtsUrl(text, url) {
    ttsUrlCache.set(text, { url: url, expiresAt: Date.now() + TTS_CACHE_TTL });
    if (ttsUrlCache.size > 10000) {
      // 防御性: 清一半老的, 防长期内存占用
      var toDelete = 5000;
      for (var key of ttsUrlCache.keys()) {
        ttsUrlCache.delete(key);
        if (--toDelete <= 0) break;
      }
    }
  }

  function checkRateLimit(key, max) {
    var now = Date.now();
    var bucket = rateLimitBuckets.get(key) || [];
    bucket = bucket.filter(function (t) { return now - t < RATE_LIMIT_WINDOW; });
    if (bucket.length >= max) return false;
    bucket.push(now);
    rateLimitBuckets.set(key, bucket);
    return true;
  }

  function getAccessToken() {
    return new Promise(function (resolve, reject) {
      if (cachedToken && Date.now() < tokenExpireAt) {
        return resolve(cachedToken);
      }
      var authUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
      https.get(authUrl, function (res) {
        var data = '';
        res.on('data', function (chunk) { data += chunk; });
        res.on('end', function () {
          try {
            var result = JSON.parse(data);
            if (result.access_token) {
              cachedToken = result.access_token;
              tokenExpireAt = Date.now() + (result.expires_in - 300) * 1000;
              resolve(cachedToken);
            } else {
              reject(new Error('获取 token 失败: ' + JSON.stringify(result)));
            }
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  function downloadFile(url) {
    return new Promise(function (resolve, reject) {
      https.get(url, function (res) {
        var chunks = [];
        res.on('data', function (chunk) { chunks.push(chunk); });
        res.on('end', function () { resolve(Buffer.concat(chunks)); });
      }).on('error', reject);
    });
  }

  /**
   * TTS 文字转语音, 返回可直接播放的 URL
   * @param {string} charOrPinyin
   * @param {string} [clientIp] - 来自 wxContext.CLIENTIP, 用于 rate limit
   * @returns {Promise<{audioUrl: string, cached: boolean}>}
   */
  function tts(charOrPinyin, clientIp) {
    var text = charOrPinyin || '';
    if (!text) return Promise.reject(new Error('char 或 pinyin 必须传一个'));

    if (clientIp && !checkRateLimit('tts:' + clientIp, RATE_LIMIT_MAX_TTS)) {
      return Promise.reject(new Error('请求过快, 请稍后再试'));
    }

    var cached = getCachedTtsUrl(text);
    if (cached) {
      return Promise.resolve({ audioUrl: cached, cached: true });
    }

    return getAccessToken().then(function (accessToken) {
      var ttsUrl = `https://tsn.baidu.com/text2audio?lan=zh&ctp=1&cuid=${cuid}&tok=${accessToken}&tex=${encodeURIComponent(text)}&vol=9&per=0&spd=5&pit=5&aue=3`;
      setCachedTtsUrl(text, ttsUrl);
      return { audioUrl: ttsUrl, cached: false };
    });
  }

  /**
   * ASR 语音识别 (multipart upload)
   * @param {Buffer} fileBuffer
   * @param {number} [devPid=80001]
   * @param {string} [clientIp]
   * @returns {Promise<object>} 百度返回的 JSON
   */
  function asr(fileBuffer, devPid, clientIp) {
    devPid = devPid || 80001;
    if (clientIp && !checkRateLimit('asr:' + clientIp, RATE_LIMIT_MAX_ASR)) {
      return Promise.reject(new Error('请求过快, 请稍后再试'));
    }

    return getAccessToken().then(function (accessToken) {
      return new Promise(function (resolve, reject) {
        try {
          var boundary = '----FormBoundary' + Date.now();
          var body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="dev_pid"\r\n\r\n${devPid}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="speech"\r\n\r\n`),
            fileBuffer,
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="len"\r\n\r\n${fileBuffer.length}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="rate"\r\n\r\n16000\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="channel"\r\n\r\n1\r\n`),
            Buffer.from(`--${boundary}--\r\n`)
          ]);

          var options = {
            hostname: 'vop.baidu.com',
            path: '/server_api?access_token=' + accessToken,
            method: 'POST',
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': body.length
            }
          };

          var req = https.request(options, function (res) {
            var chunks = [];
            res.on('data', function (chunk) { chunks.push(chunk); });
            res.on('end', function () {
              try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
              catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
          req.write(body);
          req.end();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  return {
    getAccessToken: getAccessToken,
    downloadFile: downloadFile,
    tts: tts,
    asr: asr,
    // 暴露给外部 (测试 / 调试)
    _internal: {
      getCachedTtsUrl: getCachedTtsUrl,
      setCachedTtsUrl: setCachedTtsUrl,
      checkRateLimit: checkRateLimit,
      clearCache: function () { ttsUrlCache.clear(); }
    }
  };
}

/**
 * 比较拼音相似度 (0-1)
 * @param {string} target
 * @param {string} result
 * @returns {number} 1.0=完全相同 0.75=同声母 0.3=完全不同
 */
function comparePinyin(target, result) {
  if (!target || !result) return 0;
  var normalize = require('./format').normalizePinyin;
  var t = normalize(target);
  var r = normalize(result);
  if (t === r) return 1.0;

  if (t.charAt(0) === r.charAt(0)) {
    var shengmu = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
    for (var i = 0; i < shengmu.length; i++) {
      if (t.indexOf(shengmu[i]) === 0 && r.indexOf(shengmu[i]) === 0) {
        return 0.75;
      }
    }
  }
  return 0.3;
}

module.exports = {
  createBaiduClient: createBaiduClient,
  comparePinyin: comparePinyin
};