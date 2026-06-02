/**
 * utils/audio.js
 *
 * 百度 TTS 音频拉取 + 自动重试
 *
 * 为什么需要重试:
 *  - 云函数返回的 audioUrl 是带 access_token 的一次性直链
 *  - 云函数内部缓存的 baiduAccessToken 偶尔会失效(例如冷启动 + 同时多次请求)
 *  - 客户端拿到 URL 后,token 过期会导致 wx.createInnerAudioContext 播放失败
 *  - 重试一次通常能命中云函数内部 token 刷新的路径
 */

var MAX_RETRY = 1; // 失败后重试 1 次

/**
 * 拉取 TTS 音频 URL,失败自动重试一次
 * @param {string} char - 汉字
 * @param {string} pinyin - 拼音(可选,作为降级)
 * @param {number} retryLeft - 剩余重试次数(内部用)
 * @param {function} onSuccess - 成功回调,参数: audioUrl
 * @param {function} onFail - 最终失败回调(已重试完)
 */
function fetchTTS(char, pinyin, retryLeft, onSuccess, onFail) {
  if (!char) {
    onFail && onFail();
    return;
  }

  wx.cloud.callFunction({
    name: 'main',
    data: {
      action: 'getAudio',
      data: { char: char, pinyin: pinyin }
    },
    success: function(res) {
      if (res.result && res.result.success && res.result.audioUrl) {
        onSuccess && onSuccess(res.result.audioUrl);
        return;
      }
      // 返回值失败 → 重试
      console.warn('TTS: getAudio 返回失败,errcode=' + (res.result && res.result.error), 'retryLeft=' + retryLeft);
      if (retryLeft > 0) {
        fetchTTS(char, pinyin, retryLeft - 1, onSuccess, onFail);
      } else {
        onFail && onFail();
      }
    },
    fail: function(err) {
      console.error('TTS: getAudio 调用失败:', err);
      if (retryLeft > 0) {
        fetchTTS(char, pinyin, retryLeft - 1, onSuccess, onFail);
      } else {
        onFail && onFail();
      }
    }
  });
}

/**
 * 便捷方法:拉 TTS URL 并播放,失败自动重试,最终失败走 onFallback
 * @param {string} char
 * @param {string} pinyin
 * @param {function} onFallback - 彻底失败后的回调(用于显示文字等)
 */
function playTTS(char, pinyin, onFallback) {
  fetchTTS(char, pinyin, MAX_RETRY, function(audioUrl) {
    var audio = wx.createInnerAudioContext();
    audio.src = audioUrl;
    audio.play();
    audio.onError(function(err) {
      console.error('音频播放错误:', err);
      onFallback && onFallback();
    });
  }, function() {
    onFallback && onFallback();
  });
}

module.exports = {
  fetchTTS: fetchTTS,
  playTTS: playTTS
};
