/**
 * logger.js
 *
 * 统一日志工具, 自动脱敏敏感字段 (openid / token / secret / apiKey / password).
 *
 * 背景: 主仓库 console.log 历史上有泄露风险 (P3-3 审计):
 *   - console.log('wxLogin success, openid:', openid)  -- openid 明文
 *   - console.log('TTS URL:', ttsUrl)  -- 含百度 access_token
 *   - console.log('百度 ASR 返回:', ...)  -- 可能含敏感字段
 *   - 散落 20+ 处 console.log, 风格不统一
 *
 * 用法:
 *   const logger = require('./utils/logger');
 *   logger.info('wxLogin success', { openid: 'xxx' });
 *   logger.warn('rate limit', { ip: '1.2.3.4', action: 'tts' });
 *   logger.error('baidu asr failed', { err: e.message, fileID });
 *
 * 脱敏规则 (P3-3 防御):
 *   - 字段名匹配: openid / token / secret / apiKey / password / access_token
 *   - 自动替换值为 '***' 或前 3 后 4
 *
 * 注: ES5 风格 (var + function declaration) 跟主仓库一致.
 */

var SENSITIVE_KEYS = ['openid', 'token', 'secret', 'apikey', 'password', 'access_token', 'avatar_url', 'unionid'];

function mask(value) {
  if (value === null || value === undefined) return value;
  var s = String(value);
  if (s.length <= 8) return '***';
  // 前 3 + **** + 后 4
  return s.substring(0, 3) + '****' + s.substring(s.length - 4);
}

function redact(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  var out;
  if (Array.isArray(obj)) {
    out = [];
    for (var i = 0; i < obj.length; i++) {
      out.push(typeof obj[i] === 'object' ? redact(obj[i]) : obj[i]);
    }
    return out;
  }
  out = {};
  for (var key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    var lower = key.toLowerCase();
    var isSensitive = false;
    for (var j = 0; j < SENSITIVE_KEYS.length; j++) {
      if (lower.indexOf(SENSITIVE_KEYS[j]) !== -1) {
        isSensitive = true;
        break;
      }
    }
    out[key] = isSensitive ? mask(obj[key]) : (typeof obj[key] === 'object' ? redact(obj[key]) : obj[key]);
  }
  return out;
}

function format(level, message, context) {
  var ts = new Date().toISOString();
  var prefix = '[' + ts + '] [' + level.toUpperCase() + ']';
  if (context) {
    var safe = redact(context);
    try {
      return prefix + ' ' + message + ' ' + JSON.stringify(safe);
    } catch (e) {
      return prefix + ' ' + message + ' [redact-failed]';
    }
  }
  return prefix + ' ' + message;
}

module.exports = {
  info: function (message, context) {
    console.log(format('info', message, context));
  },
  warn: function (message, context) {
    console.warn(format('warn', message, context));
  },
  error: function (message, context) {
    console.error(format('error', message, context));
  },
  // 暴露给单元测试
  _internal: {
    redact: redact,
    mask: mask,
    SENSITIVE_KEYS: SENSITIVE_KEYS
  }
};