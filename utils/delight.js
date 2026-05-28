/**
 * 愉悦体验工具模块 — Delight Engine
 * 
 * 为儿童识字小程序提供震动反馈、动画效果、随机鼓励语等愉悦交互能力。
 * 
 * 使用方式：
 *   const Delight = require('../../utils/delight.js');
 *   Delight.vibrate('light');
 * 
 * 兼容性说明：
 *   - 震动 API 仅真机可用，模拟器静默降级
 *   - 所有对外方法都做了 try-catch 保护，不会因单点失败导致页面崩溃
 */

var Delight = {

  // ==================== 震动反馈 ====================

  /**
   * 触发震动
   * @param {'light'|'medium'|'heavy'} type - 震动强度
   */
  vibrate: function (type) {
    try {
      switch (type) {
        case 'light':
          wx.vibrateShort({ type: 'light' });
          break;
        case 'medium':
          wx.vibrateShort({ type: 'medium' });
          break;
        case 'heavy':
          wx.vibrateShort({ type: 'heavy' });
          break;
        default:
          wx.vibrateShort({ type: 'light' });
      }
    } catch (e) {
      // 模拟器不支持震动，静默降级
    }
  },

  // ==================== 动画辅助 ====================

  /**
   * 抖动动画开关 — 在页面 data 中设置一个布尔开关，WXSS 中定义 CSS keyframes
   * @param {Object} page - Page 实例 (this)
   * @param {string} dataKey - data 中的布尔字段名，默认 'shaking'
   * @param {number} duration - 抖动持续时间(ms)，默认 500
   */
  shake: function (page, dataKey, duration) {
    dataKey = dataKey || 'shaking';
    duration = duration || 500;
    page.setData(defineData(dataKey, true));
    setTimeout(function () {
      page.setData(defineData(dataKey, false));
    }, duration);
  },

  /**
   * 数字滚动动画 — 从 0 递增到目标值（easeOutCubic 缓动）
   * @param {Object} page - Page 实例
   * @param {string} dataKey - data 中的数字字段名
   * @param {number} target - 目标数值
   * @param {number} duration - 动画时长(ms)，默认 800
   */
  countUp: function (page, dataKey, target, duration) {
    duration = duration || 800;
    if (!target || target <= 0) {
      page.setData(defineData(dataKey, target || 0));
      return;
    }
    var start = 0;
    var startTime = Date.now();

    function step() {
      var elapsed = Date.now() - startTime;
      var progress = Math.min(elapsed / duration, 1);
      // easeOutCubic: 1 - (1-t)^3
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(start + (target - start) * eased);
      page.setData(defineData(dataKey, current));
      if (progress < 1) {
        setTimeout(step, 16);
      } else {
        page.setData(defineData(dataKey, target));
      }
    }
    step();
  },

  /**
   * 批量数字滚动 — 依次带动画
   * @param {Object} page
   * @param {Array<{key: string, target: number}>} items
   * @param {number} staggerDelay - 每个之间的间隔(ms)，默认 200
   */
  countUpBatch: function (page, items, staggerDelay) {
    staggerDelay = staggerDelay || 200;
    var self = this;
    items.forEach(function (item, index) {
      setTimeout(function () {
        self.countUp(page, item.key, item.value || item.target);
      }, index * staggerDelay);
    });
  },

  // ==================== 粒子动画 ====================

  /**
   * 星星粒子动画 — 将星星数据写入 page.data.stars 并开启 showStars
   * 需要在 WXSS 中配合定义 .star-particle 的 keyframes 动画
   * @param {Object} page - Page 实例
   * @param {number} count - 星星数量，默认 8
   * @param {number} duration - 显示时长(ms)，默认 1500
   */
  burstStars: function (page, count, duration) {
    count = count || 8;
    duration = duration || 1500;
    var stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 60 + 20,
        size: 12 + Math.random() * 20,
        delay: Math.random() * 0.3,
        rotate: Math.random() * 360
      });
    }
    page.setData({ showStars: true, stars: stars });
    setTimeout(function () {
      page.setData({ showStars: false, stars: [] });
    }, duration);
  },

  /**
   * 烟花粒子动画 — 将烟花数据写入 page.data.confetti 并开启 showConfetti
   * 需要在 WXSS 中配合定义 .confetti-particle 的 keyframes 动画
   * @param {Object} page - Page 实例
   * @param {number} duration - 显示时长(ms)，默认 2000
   */
  burstConfetti: function (page, duration) {
    duration = duration || 2000;
    var colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F43', '#C77DFF'];
    var confetti = [];
    for (var i = 0; i < 30; i++) {
      confetti.push({
        id: i,
        x: Math.random() * 100,
        startY: -10 - Math.random() * 20,
        endY: 100 + Math.random() * 40,
        color: colors[i % colors.length],
        size: 6 + Math.random() * 10,
        delay: Math.random() * 0.8,
        duration: 1 + Math.random() * 1.5,
        wobble: (Math.random() - 0.5) * 40
      });
    }
    page.setData({ showConfetti: true, confetti: confetti });
    this.vibrate('medium');
    setTimeout(function () {
      page.setData({ showConfetti: false, confetti: [] });
    }, duration);
  },

  // ==================== 连击系统 ====================

  /**
   * 获取连击等级信息
   * @param {number} combo - 连续正确次数
   * @returns {Object|null} { icon, label, color } 或 null（未达到连击门槛）
   */
  getComboLevel: function (combo) {
    if (combo >= 10) return { icon: '🔥🔥🔥', label: '超级连击！', color: '#FF4500' };
    if (combo >= 7)  return { icon: '🔥🔥',   label: '太厉害了！', color: '#FF6347' };
    if (combo >= 5)  return { icon: '🔥',     label: '连击达成！', color: '#FF9F43' };
    if (combo >= 3)  return { icon: '✨',     label: '三连正确！', color: '#FFD93D' };
    return null;
  },

  // ==================== 随机文案 ====================

  /**
   * 获取随机表扬语（答对时用）
   * @returns {string}
   */
  getPraise: function () {
    var list = [
      '太棒了！', '真厉害！', '好聪明！', '完美！',
      '真了不起！', '学得真好！', '真不错！', '棒棒哒！',
      '好极了！', '一百分！', '小天才！', '真聪明！'
    ];
    return list[Math.floor(Math.random() * list.length)];
  },

  /**
   * 获取随机鼓励语（答错时用，温和不打击）
   * @returns {string}
   */
  getEncourage: function () {
    var list = [
      '加油，再试一次~', '差一点点，再来！', '没关系，慢慢来~',
      '下次一定行！', '再多读几遍吧~', '你已经很棒了，再试试！',
      '勇敢的小朋友不怕错！', '仔细看看，再读一次~'
    ];
    return list[Math.floor(Math.random() * list.length)];
  },

  // ==================== 音效（以振动模拟） ====================

  /**
   * 播放反馈音效 — 当前用差异化震动代替
   * 后续可扩展为真实云存储音频播放
   * @param {'success'|'cheer'|'tap'|'wrong'|'complete'} type
   */
  playSound: function (type) {
    switch (type) {
      case 'success':
      case 'cheer':
        this.vibrate('light');
        break;
      case 'wrong':
        this.vibrate('heavy');
        break;
      case 'complete':
        this.vibrate('medium');
        break;
      case 'tap':
        // 轻触不需要震动
        break;
      default:
        this.vibrate('light');
    }
  }
};

// ==================== 工具函数 ====================

/**
 * 构造 { key: value } 对象（用于 setData 计算属性名）
 * 微信小程序支持 ES6 计算属性名，但为了保险这里手动构造
 */
function defineData(key, value) {
  var obj = {};
  obj[key] = value;
  return obj;
}

module.exports = Delight;
