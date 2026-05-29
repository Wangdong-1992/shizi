// 云函数入口
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 微信小程序配置
const WX_APPID = 'wxa2bbfca6b9ef6ebd';
const WX_APPSECRET = '1107be03905f4721c554bcfc539708d7';

// 百度语音识别配置
const BAIDU_API_KEY = '9Cwtp66NdN02jE5sALz7Q5rD';
const BAIDU_SECRET_KEY = 'yHh8xH9BICC0ZH4oOEGAdZEeXemviwN6';

// 百度 Access Token 缓存
let baiduAccessToken = null;
let tokenExpireTime = 0;

// ============================================================
// V2.2 间隔重复算法（内嵌副本，与 utils/spaced-repetition.js 保持一致）
// 云函数无法引用 utils 目录，必须内嵌
// ============================================================
var BOX_INTERVALS = [1, 3, 7, 14, 30];

function calculateNextReview(boxLevel, isCorrect) {
  var newLevel = updateBoxLevel(boxLevel, isCorrect);
  var interval = BOX_INTERVALS[newLevel - 1];
  var nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  var yyyy = nextDate.getFullYear();
  var mm = String(nextDate.getMonth() + 1).padStart(2, '0');
  var dd = String(nextDate.getDate()).padStart(2, '0');
  return {
    boxLevel: newLevel,
    nextReviewDate: yyyy + '-' + mm + '-' + dd,
    reviewInterval: interval
  };
}

function updateBoxLevel(boxLevel, isCorrect) {
  if (isCorrect) {
    return Math.min(boxLevel + 1, 5);
  }
  return 1;
}

function updateMasteryStatus(currentStatus, progress, isCorrect) {
  // 注意: isAssisted 和 exerciseType 的影响已在调用方通过调整 progress 计数器体现
  // (recognition_correct/recall_correct 只在非辅助时累加)
  var status = currentStatus || 'new';
  var recognitionCorrect = (progress && progress.recognition_correct) || 0;
  var recallCorrect = (progress && progress.recall_correct) || 0;
  var crossDayCorrect = (progress && progress.cross_day_correct) || 0;
  var consecutiveCorrect = (progress && progress.consecutive_correct) || 0;
  var consecutiveWrong = (progress && progress.consecutive_wrong) || 0;
  var boxLevel = (progress && progress.box_level) || 1;

  // 降级规则（优先判断）
  if ((status === 'mastered' || status === 'solid') && consecutiveWrong >= 2) {
    return 'familiar';
  }
  if (status === 'familiar' && consecutiveWrong >= 2) {
    return 'seeing';
  }
  if (status === 'seeing' && consecutiveWrong >= 2) {
    return 'new';
  }

  // 答错不升级
  if (!isCorrect) {
    return status;
  }

  // 升级规则
  if (status === 'new') {
    return 'seeing';
  }
  if (status === 'seeing' && recognitionCorrect >= 2) {
    return 'familiar';
  }
  if (status === 'familiar' && recallCorrect >= 2 && crossDayCorrect >= 1) {
    return 'mastered';
  }
  if (status === 'mastered' && boxLevel === 5 && consecutiveCorrect >= 3) {
    return 'solid';
  }

  return status;
}

function calculatePriority(progress, today) {
  var nextReviewDate = (progress && progress.next_review_date) || null;
  var maxInterval = BOX_INTERVALS[BOX_INTERVALS.length - 1];
  var correctCount = (progress && progress.correct_count) || 0;
  var wrongCount = (progress && progress.wrong_count) || 0;

  var urgency = calculateUrgencyScore(nextReviewDate, maxInterval, today);
  var difficulty = calculateDifficultyScore(correctCount, wrongCount);
  var random = Math.random() * 100;

  var priority = urgency * 0.5 + difficulty * 0.3 + random * 0.2;
  return Math.min(100, Math.max(0, priority));
}

function calculateUrgencyScore(nextReviewDate, maxInterval, today) {
  if (!nextReviewDate) {
    return 100;
  }
  // 使用传入的 today 参数，避免服务器时区差异
  var todayDate = today ? new Date(today + 'T00:00:00') : new Date();
  var reviewDate = new Date(nextReviewDate + 'T00:00:00');
  var diffMs = todayDate.getTime() - reviewDate.getTime();
  var diffDays = diffMs / (1000 * 60 * 60 * 24);
  var urgency = Math.max(0, diffDays / maxInterval) * 100;
  return Math.min(100, urgency);
}

function calculateDifficultyScore(correctCount, wrongCount) {
  if (correctCount === 0 && wrongCount === 0) {
    return 50;
  }
  var total = correctCount + wrongCount;
  var difficulty = (1 - correctCount / total) * 100;
  return Math.min(100, Math.max(0, difficulty));
}

function migrateOldProgress(oldRecord, today) {
  var oldStatus = (oldRecord && oldRecord.old_status) || 'new';
  var correctCount = (oldRecord && oldRecord.correct_count) || 0;
  var wrongCount = (oldRecord && oldRecord.wrong_count) || 0;
  var openid = (oldRecord && oldRecord.openid) || '';
  var charId = (oldRecord && oldRecord.char_id) || '';
  var boxLevel = 1;
  var status = 'new';
  var nextReviewDate = today;
  var reviewInterval = 1;

  if (oldStatus === 'mastered') {
    if (correctCount >= 5) {
      boxLevel = 3;
      status = 'familiar';
      reviewInterval = BOX_INTERVALS[2];
      var d1 = new Date(today + 'T00:00:00');
      d1.setDate(d1.getDate() + 3);
      var y1 = d1.getFullYear();
      var m1 = String(d1.getMonth() + 1).padStart(2, '0');
      var dd1 = String(d1.getDate()).padStart(2, '0');
      nextReviewDate = y1 + '-' + m1 + '-' + dd1;
    } else {
      boxLevel = 2;
      status = 'seeing';
      reviewInterval = BOX_INTERVALS[1];
      var d2 = new Date(today + 'T00:00:00');
      d2.setDate(d2.getDate() + 1);
      var y2 = d2.getFullYear();
      var m2 = String(d2.getMonth() + 1).padStart(2, '0');
      var dd2 = String(d2.getDate()).padStart(2, '0');
      nextReviewDate = y2 + '-' + m2 + '-' + dd2;
    }
  } else if (oldStatus === 'learning') {
    boxLevel = 1;
    status = 'seeing';
    nextReviewDate = today;
    reviewInterval = BOX_INTERVALS[0];
  } else {
    boxLevel = 1;
    status = 'new';
    nextReviewDate = today;
    reviewInterval = BOX_INTERVALS[0];
  }

  return {
    openid: openid,
    char_id: charId,
    box_level: boxLevel,
    status: status,
    next_review_date: nextReviewDate,
    review_interval: reviewInterval,
    correct_count: correctCount,
    wrong_count: wrongCount,
    recognition_correct: 0,
    recall_correct: 0,
    cross_day_correct: 0,
    consecutive_correct: 0,
    consecutive_wrong: 0,
    last_review_date: today,
    last_correct_date: '',
    is_assisted: false,
    error_type: '',
    error_count_by_type: { shape_similar: 0, sound_similar: 0, stroke: 0, general: 0 },
    created_at: new Date(),
    updated_at: new Date()
  };
}

function createDefaultProgress(openid, charId) {
  var todayObj = new Date();
  var yyyy = todayObj.getFullYear();
  var mm = String(todayObj.getMonth() + 1).padStart(2, '0');
  var dd = String(todayObj.getDate()).padStart(2, '0');
  var today = yyyy + '-' + mm + '-' + dd;

  return {
    openid: openid,
    char_id: charId,
    box_level: 1,
    status: 'new',
    next_review_date: today,
    review_interval: BOX_INTERVALS[0],
    correct_count: 0,
    wrong_count: 0,
    recognition_correct: 0,
    recall_correct: 0,
    cross_day_correct: 0,
    consecutive_correct: 0,
    consecutive_wrong: 0,
    error_type: '',
    error_count_by_type: { shape_similar: 0, sound_similar: 0, stroke: 0, general: 0 },
    last_review_date: '',
    last_correct_date: '',
    is_assisted: false,
    created_at: new Date(),
    updated_at: new Date()
  };
}
// ============================================================
// 间隔重复算法 END
// ============================================================

// 成就配置
const ACHIEVEMENTS = [
  { id: 'ACH001', name: '初次识字', requirement: 1, icon: '🎓', reward: { type: 'star', amount: 3 } },
  { id: 'ACH002', name: '小小学生', requirement: 50, icon: '🌟', reward: { type: 'star', amount: 10 } },
  { id: 'ACH003', name: '认字小达人', requirement: 200, icon: '📖', reward: { type: 'flower', amount: 2 } },
  { id: 'ACH004', name: '认字小高手', requirement: 500, icon: '🏅', reward: { type: 'flower', amount: 5 } },
  { id: 'ACH005', name: '汉字小博士', requirement: 1000, icon: '🎖️', reward: { type: 'flower', amount: 10 } },
  { id: 'ACH006', name: '汉字小状元', requirement: 2000, icon: '👑', reward: { type: 'flower', amount: 20 } },
  { id: 'ACH007', name: '汉字小天才', requirement: 3500, icon: '🌈', reward: { type: 'flower', amount: 50 } }
];

// 微信 code 换 openid
function code2openid(code) {
  return new Promise((resolve, reject) => {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_APPSECRET}&js_code=${code}&grant_type=authorization_code`;

    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.openid) {
            resolve(result.openid);
          } else {
            console.error('code2openid failed:', result);
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      console.error('code2openid network error:', err.message);
      resolve(null);
    });

    req.setTimeout(5000, () => {
      console.error('code2openid timeout');
      req.destroy();
      resolve(null);
    });
  });
}

// 微信 Access Token 缓存（用于 getPhoneNumber 等需要 access_token 的接口）
let wxAccessToken = null;
let wxAccessTokenExpire = 0;

function getWxAccessToken() {
  return new Promise((resolve, reject) => {
    if (wxAccessToken && Date.now() < wxAccessTokenExpire) {
      return resolve(wxAccessToken);
    }
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_APPSECRET}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) {
            wxAccessToken = result.access_token;
            wxAccessTokenExpire = Date.now() + (result.expires_in - 300) * 1000;
            resolve(wxAccessToken);
          } else {
            reject(new Error('获取微信 access_token 失败: ' + JSON.stringify(result)));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// 获取百度 Access Token
function getBaiduAccessToken() {
  return new Promise((resolve, reject) => {
    if (baiduAccessToken && Date.now() < tokenExpireTime) {
      return resolve(baiduAccessToken);
    }

    const grantType = 'client_credentials';
    const authUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=${grantType}&client_id=${BAIDU_API_KEY}&client_secret=${BAIDU_SECRET_KEY}`;

    https.get(authUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) {
            baiduAccessToken = result.access_token;
            tokenExpireTime = Date.now() + (result.expires_in - 300) * 1000;
            resolve(baiduAccessToken);
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

// 下载文件为 Buffer
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// 百度语音识别
function baiduASR(fileBuffer, devPid = 80001) {
  return new Promise(async (resolve, reject) => {
    try {
      const accessToken = await getBaiduAccessToken();
      const boundary = '----FormBoundary' + Date.now();

      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="dev_pid"\r\n\r\n${devPid}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="speech"\r\n\r\n`),
        fileBuffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="len"\r\n\r\n${fileBuffer.length}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="rate"\r\n\r\n16000\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="channel"\r\n\r\n1\r\n`),
        Buffer.from(`--${boundary}--\r\n`)
      ]);

      const options = {
        hostname: 'vop.baidu.com',
        path: '/server_api?access_token=' + accessToken,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// 比较拼音相似度
function comparePinyin(target, result) {
  if (!target || !result) return 0;

  const normalize = function(p) {
    return p.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, function(match) {
      var map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
            'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
            'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
      return map[match] || match;
    }).toLowerCase();
  };

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

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event;

  try {
    const db = cloud.database();
    const _ = db.command;

    switch (action) {
      case 'wxLogin': {
        const { code, nickname, avatar } = data;
        if (!code) {
          return { success: false, error: 'code不能为空' };
        }

        // 1. 用 code 换 openid
        const openid = await code2openid(code);
        if (!openid) {
          return { success: false, error: 'code无效，获取openid失败' };
        }

        // 2. 生成 token
        const token = crypto.randomBytes(32).toString('base64');
        const tokenExpire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7天后过期

        // 3. 查用户是否存在
        const userRes = await db.collection('users').where({ openid }).get();

        if (userRes.data && userRes.data.length > 0) {
          // 存在 → 更新昵称头像和 token
          await db.collection('users').where({ openid }).update({
            data: {
              nickname: nickname || userRes.data[0].nickname,
              avatar_url: avatar || userRes.data[0].avatar_url,
              token: token,
              token_expire: tokenExpire,
              updated_at: new Date()
            }
          });
        } else {
          // 不存在 → 新建用户
          await db.collection('users').add({
            data: {
              openid,
              nickname: nickname || '小朋友',
              avatar_url: avatar || '',
              token: token,
              token_expire: tokenExpire,
              star_count: 0,
              flower_count: 0,
              streak_count: 0,
              mastered_chars: [],
              last_learn_date: '',
              created_at: new Date(),
              updated_at: new Date()
            }
          });
        }

        console.log('wxLogin success, openid:', openid, 'token:', token);
        return { success: true, token, openid };
      }

      case 'getUser': {
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        return { success: true, data: userRes.data[0] || null };
      }

      case 'getStats': {
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          return { success: true, data: { mastered_count: 0, star_count: 0, flower_count: 0, streak_count: 0 } };
        }
        const user = userRes.data[0];
        const masteredIds = [...new Set((user.mastered_chars || []).map(id => String(id)))];

        let masteredCount = 0;
        if (masteredIds.length > 0) {
          // 与 getMasteredChars 保持一致的计数逻辑：交叉比对 characters 表
          // 避免 mastered_chars 中的悬空 ID 导致首页和列表页数量不一致
          const charsRes = await db.collection('characters').limit(2256).get();
          const allChars = charsRes.data;
          const matched = allChars.filter(function(c) {
            var idStr = String(c.id || '');
            var _idStr = String(c._id || '');
            return masteredIds.some(function(mid) { return mid === idStr || mid === _idStr; });
          });
          // 按 id 去重
          var seen = new Set();
          for (var i = 0; i < matched.length; i++) {
            seen.add(matched[i].id || matched[i]._id);
          }
          masteredCount = seen.size;
        }

        return {
          success: true,
          data: {
            mastered_count: masteredCount,
            star_count: user.star_count || 0,
            flower_count: user.flower_count || 0,
            streak_count: user.streak_count || 0
          }
        };
      }

      case 'getNextChar': {
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          // 用户不存在，创建新用户
          await db.collection('users').add({
            data: {
              openid,
              nickname: '小朋友',
              star_count: 0,
              flower_count: 0,
              streak_count: 0,
              mastered_chars: [],
              last_learn_date: '',
              created_at: new Date()
            }
          });
          // 获取第一个汉字
          const charsRes = await db.collection('characters').limit(1).get();
          return { success: true, data: charsRes.data[0] || null };
        }

        const user = userRes.data[0];
        const masteredIds = (user.mastered_chars || []).map(id => String(id));

        // 获取所有汉字，在内存中过滤（避免 nin 查询的类型问题）
        const charsRes = await db.collection('characters').limit(2256).get();
        const allChars = charsRes.data;

        if (masteredIds.length === 0) {
          // 没有学习记录，返回第一个
          return { success: true, data: allChars[0] || null };
        }

        // 过滤出未掌握的汉字（id 和 _id 都要匹配，字符串比较）
        const unmastered = allChars.filter(c => {
          const idStr = String(c.id || '');
          const _idStr = String(c._id || '');
          return !masteredIds.some(mid => mid === idStr || mid === _idStr);
        });

        // 随机返回一个
        if (unmastered.length > 0) {
          const randomIndex = Math.floor(Math.random() * unmastered.length);
          return { success: true, data: unmastered[randomIndex] };
        }

        return { success: true, data: null, error: '已学完所有汉字' };
      }

      case 'recordLearn': {
        const { openid, charId, isAssisted = false } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          return { success: false, error: '用户不存在' };
        }

        const user = userRes.data[0];
        let masteredChars = user.mastered_chars || [];
        const rewards = [];

        // 字符串化后比较，避免 id 和 _id 类型不一致导致重复添加
        const charIdStr = String(charId);
        const alreadyMastered = masteredChars.some(id => String(id) === charIdStr);

        if (!alreadyMastered) {
          masteredChars.push(charIdStr);
          rewards.push({ type: 'star', source: 'single_learn', amount: 1 });

          // 检查连续学习奖励
          const streak = (user.streak_count || 0) + 1;
          if (streak % 10 === 0) {
            rewards.push({ type: 'star', source: 'streak_10', amount: 3 });
          }
          if (streak % 50 === 0) {
            rewards.push({ type: 'flower', source: 'streak_50', amount: 1 });
          }

          // 计算总奖励
          const starInc = rewards.filter(r => r.type === 'star').reduce((sum, r) => sum + r.amount, 0);
          const flowerInc = rewards.filter(r => r.type === 'flower').reduce((sum, r) => sum + r.amount, 0);

          await db.collection('users').where({ openid }).update({
            data: {
              mastered_chars: masteredChars,
              streak_count: streak,
              last_learn_date: new Date().toISOString().split('T')[0],
              last_learn_assisted: isAssisted ? new Date().toISOString() : null,
              star_count: _.inc(starInc),
              flower_count: _.inc(flowerInc)
            }
          });

          // 记录奖励日志
          for (const reward of rewards) {
            await db.collection('reward_logs').add({
              data: {
                openid,
                reward_type: reward.type === 'star' ? 1 : 2,
                reward_amount: reward.amount,
                source: reward.source,
                created_at: new Date()
              }
            });
          }

          // 检查成就解锁
          await checkAndUnlockAchievements(db, _, openid, masteredChars.length);
        }

        return { success: true, rewards, mastered: true };
      }

      // ============================================================
      // V2.2: getPendingReview - 使用间隔重复优先级算法
      // ============================================================
      case 'getPendingReview': {
        const { openid, limit = 10 } = data;

        // 获取今日日期
        var todayObj = new Date();
        var todayYYYY = todayObj.getFullYear();
        var todayMM = String(todayObj.getMonth() + 1).padStart(2, '0');
        var todayDD = String(todayObj.getDate()).padStart(2, '0');
        var today = todayYYYY + '-' + todayMM + '-' + todayDD;

        // 查询 learning_progress：next_review_date <= today 或 next_review_date 为空
        var progressRecords = [];
        try {
          // 查询 next_review_date <= today 的记录
          var dueRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              next_review_date: _.lte(today)
            })
            .get();
          progressRecords = dueRes.data || [];

          // 查询 next_review_date 不存在的旧记录
          var noDateRes = await db.collection('learning_progress')
            .where({
              openid: openid,
              next_review_date: _.eq(null)
            })
            .get();
          var noDateRecords = noDateRes.data || [];

          // 合并去重
          var existingIds = {};
          for (var pi = 0; pi < progressRecords.length; pi++) {
            existingIds[progressRecords[pi]._id] = true;
          }
          for (var ni = 0; ni < noDateRecords.length; ni++) {
            if (!existingIds[noDateRecords[ni]._id]) {
              progressRecords.push(noDateRecords[ni]);
            }
          }
        } catch (e) {
          console.error('getPendingReview query error:', e.message);
          // learning_progress 表可能不存在，回退到旧逻辑
          var userRes = await db.collection('users').where({ openid: openid }).get();
          if (!userRes.data || userRes.data.length === 0) {
            return { success: true, data: [], count: 0 };
          }
          var user = userRes.data[0];
          var masteredIds = (user.mastered_chars || []).map(function(id) { return String(id); });
          if (masteredIds.length === 0) {
            return { success: true, data: [], count: 0 };
          }
          var charsRes = await db.collection('characters').limit(2256).get();
          var allChars = charsRes.data;
          var masteredChars = allChars.filter(function(c) {
            var idStr = String(c.id || '');
            var _idStr = String(c._id || '');
            return masteredIds.some(function(mid) { return mid === idStr || mid === _idStr; });
          });
          masteredChars.sort(function() { return Math.random() - 0.5; });
          return {
            success: true,
            data: masteredChars.slice(0, limit).map(function(c) {
              return {
                id: c.id || c._id,
                char: c.char,
                pinyin: c.pinyin,
                strokes: c.strokes || 0,
                words: c.words || [],
                meaning: c.meaning || '',
                image_url: c.image_url || '',
                progress: { box_level: 1, status: 'new', next_review_date: '', consecutive_correct: 0, consecutive_wrong: 0 }
              };
            }),
            count: masteredChars.length
          };
        }

        if (progressRecords.length === 0) {
          return { success: true, data: [], count: 0 };
        }

        // 计算优先级并排序
        for (var pri = 0; pri < progressRecords.length; pri++) {
          progressRecords[pri]._priority = calculatePriority(progressRecords[pri], today);
        }
        progressRecords.sort(function(a, b) {
          return b._priority - a._priority;
        });

        // 取前 limit 条
        var topRecords = progressRecords.slice(0, limit);

        // 查 characters 集合补充字详情
        var charIds = topRecords.map(function(r) { return r.char_id; });
        var charsRes2 = await db.collection('characters').limit(2256).get();
        var allChars2 = charsRes2.data;
        var charMap = {};
        for (var ci = 0; ci < allChars2.length; ci++) {
          var c = allChars2[ci];
          var cId = String(c.id || c._id || '');
          charMap[cId] = c;
        }

        var result = [];
        for (var ri = 0; ri < topRecords.length; ri++) {
          var rec = topRecords[ri];
          var charId = String(rec.char_id || '');
          var charInfo = charMap[charId] || {};
          result.push({
            id: charInfo.id || charInfo._id || charId,
            char: charInfo.char || '',
            pinyin: charInfo.pinyin || '',
            strokes: charInfo.strokes || 0,
            words: charInfo.words || [],
            meaning: charInfo.meaning || '',
            image_url: charInfo.image_url || '',
            progress: {
              box_level: rec.box_level || 1,
              status: rec.status || 'new',
              next_review_date: rec.next_review_date || '',
              consecutive_correct: rec.consecutive_correct || 0,
              consecutive_wrong: rec.consecutive_wrong || 0
            }
          });
        }

        return {
          success: true,
          data: result,
          count: progressRecords.length
        };
      }

      case 'getAchievements': {
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        const masteredCount = userRes.data[0]?.mastered_chars?.length || 0;

        const unlockedRes = await db.collection('achievement_log')
          .where({ openid })
          .get();
        const unlockedIds = unlockedRes.data.map(a => a.achievement_id);

        return {
          success: true,
          data: {
            total: ACHIEVEMENTS.length,
            unlocked_count: unlockedIds.length,
            mastered_count: masteredCount,
            achievements: ACHIEVEMENTS.map(ach => ({
              id: ach.id,
              name: ach.name,
              icon: ach.icon,
              unlocked: unlockedIds.includes(ach.id),
              progress: Math.min((masteredCount / ach.requirement) * 100, 100)
            }))
          }
        };
      }

      case 'getOptions': {
        // 获取听音选字选项（同音字+随机干扰项）
        const { charId } = data;

        // charId 可能是 _id 或 id，尝试用 _id 查询
        let char;
        try {
          const charRes = await db.collection('characters').doc(charId).get();
          if (charRes.data) {
            char = charRes.data;
          }
        } catch (e) {
          // doc 查询失败，尝试用 id 字段查询
        }

        // 如果没找到，尝试用 id 字段查询
        if (!char) {
          const charsRes = await db.collection('characters').limit(2256).get();
          char = charsRes.data.find(c => String(c._id) === String(charId) || String(c.id) === String(charId));
        }

        if (!char) {
          return { success: false, error: '汉字不存在' };
        }

        const targetId = char.id || char._id;
        const pinyinBase = char.pinyin.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, match => {
          const map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
                        'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
                        'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
          return map[match] || match;
        });

        // 获取所有汉字，在内存中筛选同音字
        const allCharsRes = await db.collection('characters').limit(2256).get();
        const allChars = allCharsRes.data;

        // 筛选同音字（排除当前字）
        const homophones = allChars.filter(c => {
          if (c._id === char._id || c.id === targetId) return false;
          const cPinyinBase = (c.pinyin || '').replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, match => {
            const map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
                          'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
                          'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
            return map[match] || match;
          });
          return cPinyinBase === pinyinBase;
        });

        // 随机获取干扰项
        const otherChars = allChars.filter(c => {
          if (c._id === char._id || c.id === targetId) return false;
          const cPinyinBase = (c.pinyin || '').replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, match => {
            const map = { 'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
                          'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
                          'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v' };
            return map[match] || match;
          });
          return cPinyinBase !== pinyinBase;
        });

        // 打乱顺序
        homophones.sort(() => Math.random() - 0.5);
        otherChars.sort(() => Math.random() - 0.5);

        // 组合选项：先放错误选项（最多3个），再放正确答案
        const options = [];
        for (const h of homophones) {
          if (options.length < 2) {
            options.push({ id: h._id, char: h.char, isCorrect: false });
          }
        }
        for (const c of otherChars) {
          if (options.length < 3) {
            options.push({ id: c._id, char: c.char, isCorrect: false });
          }
        }

        // 添加正确答案（确保一定在选项中）
        options.push({ id: char._id, char: char.char, isCorrect: true });

        // 打乱所有选项
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }

        return { success: true, data: { char: { id: targetId, char: char.char, pinyin: char.pinyin }, options: options.slice(0, 4) } };
      }

      // ============================================================
      // V2.2: recordReview - 从"只写日志"升级为"三写"
      // 1) 写 review_logs
      // 2) 读/创建 learning_progress
      // 3) 更新 learning_progress
      // ============================================================
      case 'recordReview': {
        var reviewOpenid = data.openid;
        var reviewCharId = data.charId;
        var reviewMode = data.reviewMode;
        var reviewIsCorrect = data.isCorrect;
        var reviewIsAssisted = data.isAssisted || false;
        var reviewAsrScore = data.asrScore || null;
        var reviewExerciseType = data.exerciseType || 'recognition';

        try {
          // --- 写1: review_logs ---
          await db.collection('review_logs').add({
            data: {
              openid: reviewOpenid,
              char_id: reviewCharId,
              review_mode: reviewMode === 'listen' ? 1 : 2,
              is_correct: reviewIsCorrect,
              is_assisted: reviewIsAssisted,
              exercise_type: reviewExerciseType,
              status: reviewIsAssisted ? 'pending' : 'confirmed',
              asr_score: reviewAsrScore,
              reviewed_at: new Date()
            }
          });
        } catch (err) {
          console.error('recordReview log error:', err.message);
        }

        try {
          // --- 写2: 读/创建 learning_progress ---
          var todayDate = new Date();
          var todayStr = todayDate.getFullYear() + '-' + String(todayDate.getMonth() + 1).padStart(2, '0') + '-' + String(todayDate.getDate()).padStart(2, '0');

          var progressRes = await db.collection('learning_progress')
            .where({ openid: reviewOpenid, char_id: reviewCharId })
            .get();

          var progressRecord = null;
          if (progressRes.data && progressRes.data.length > 0) {
            progressRecord = progressRes.data[0];
          } else {
            // 无记录则创建默认进度
            var defaultProgress = createDefaultProgress(reviewOpenid, reviewCharId);
            var addRes = await db.collection('learning_progress').add({ data: defaultProgress });
            // 重新查询以获取完整记录（含 _id）
            var newProgressRes = await db.collection('learning_progress')
              .where({ openid: reviewOpenid, char_id: reviewCharId })
              .get();
            progressRecord = newProgressRes.data && newProgressRes.data.length > 0 ? newProgressRes.data[0] : defaultProgress;
          }

          var currentBoxLevel = progressRecord.box_level || 1;
          var currentStatus = progressRecord.status || 'new';
          var previousStatus = currentStatus;
          var previousBoxLevel = currentBoxLevel;

          // --- 写3: 更新 learning_progress ---
          var newBoxLevel = updateBoxLevel(currentBoxLevel, reviewIsCorrect);
          var nextReviewResult = calculateNextReview(currentBoxLevel, reviewIsCorrect);

          // 构建传入 updateMasteryStatus 的 progress 对象（含更新后的计数）
          var progressForStatus = {
            recognition_correct: progressRecord.recognition_correct || 0,
            recall_correct: progressRecord.recall_correct || 0,
            cross_day_correct: progressRecord.cross_day_correct || 0,
            consecutive_correct: reviewIsCorrect ? (progressRecord.consecutive_correct || 0) + 1 : 0,
            consecutive_wrong: reviewIsCorrect ? 0 : (progressRecord.consecutive_wrong || 0) + 1,
            box_level: newBoxLevel,
            is_assisted: reviewIsAssisted
          };

          // 注意: recognition_correct 和 recall_correct 需要在状态判断前先加上本次的
          if (reviewExerciseType === 'recognition' && reviewIsCorrect && !reviewIsAssisted) {
            progressForStatus.recognition_correct += 1;
          }
          if (reviewExerciseType === 'recall' && reviewIsCorrect && !reviewIsAssisted) {
            progressForStatus.recall_correct += 1;
          }

          // cross_day_correct: isCorrect && last_correct_date != today → +1
          var lastCorrectDate = progressRecord.last_correct_date || '';
          if (reviewIsCorrect && lastCorrectDate !== todayStr) {
            progressForStatus.cross_day_correct += 1;
          }

          var newStatus = updateMasteryStatus(currentStatus, progressForStatus, reviewIsCorrect);

          // 构建更新数据
          var updateData = {
            box_level: newBoxLevel,
            status: newStatus,
            next_review_date: nextReviewResult.nextReviewDate,
            review_interval: nextReviewResult.reviewInterval,
            last_review_date: todayStr,
            is_assisted: reviewIsAssisted,
            updated_at: new Date()
          };

          // 首次学习日期：status 从 new 变为其他状态时记录
          if (currentStatus === 'new' && newStatus !== 'new' && !progressRecord.first_learn_date) {
            updateData.first_learn_date = todayStr;
          }

          // consecutive_correct / consecutive_wrong: 答对+1/归零, 答错+1/归零
          if (reviewIsCorrect) {
            updateData.consecutive_correct = _.inc(1);
            updateData.consecutive_wrong = 0;
            updateData.correct_count = _.inc(1);
            updateData.last_correct_date = todayStr;
          } else {
            updateData.consecutive_correct = 0;
            updateData.consecutive_wrong = _.inc(1);
            updateData.wrong_count = _.inc(1);
            updateData.error_type = 'general';
            updateData['error_count_by_type.general'] = _.inc(1);
            // last_correct_date 保持不变，不设置
          }

          // recognition_correct: exerciseType==='recognition' && isCorrect && !isAssisted → +1
          if (reviewExerciseType === 'recognition' && reviewIsCorrect && !reviewIsAssisted) {
            updateData.recognition_correct = _.inc(1);
          }

          // recall_correct: exerciseType==='recall' && isCorrect && !isAssisted → +1
          if (reviewExerciseType === 'recall' && reviewIsCorrect && !reviewIsAssisted) {
            updateData.recall_correct = _.inc(1);
          }

          // cross_day_correct: isCorrect && last_correct_date != today → +1
          if (reviewIsCorrect && lastCorrectDate !== todayStr) {
            updateData.cross_day_correct = _.inc(1);
          }

          // 执行更新
          await db.collection('learning_progress')
            .where({ openid: reviewOpenid, char_id: reviewCharId })
            .update({ data: updateData });

          var statusChanged = (newStatus !== previousStatus);

          return {
            success: true,
            newBoxLevel: newBoxLevel,
            previousBoxLevel: previousBoxLevel,
            newStatus: newStatus,
            nextReviewDate: nextReviewResult.nextReviewDate,
            reviewInterval: nextReviewResult.reviewInterval,
            statusChanged: statusChanged,
            previousStatus: previousStatus,
            currentStatus: newStatus
          };
        } catch (err) {
          console.error('recordReview progress error:', err.message);
          // 即使进度更新失败，也返回成功（日志已写入）
          return { success: true, progressError: err.message };
        }
      }

      case 'recognizeVoice': {
        // 百度语音识别
        const { fileID, targetPinyin } = data;
        console.log('recognizeVoice called, fileID:', fileID, 'target:', targetPinyin);

        try {
          // 下载音频文件（云存储 URL）
          const fileBuffer = await cloud.downloadFile({ fileID });
          console.log('文件下载成功，大小:', fileBuffer.fileContent.length);

          // 调用百度 ASR（传入 Buffer）
          const result = await baiduASR(fileBuffer.fileContent);
          console.log('百度 ASR 返回:', JSON.stringify(result));

          // 解析结果
          if (result.err_no === 0 && result.result && result.result[0]) {
            const recognized = result.result[0]; // 识别出的文本（拼音）
            const score = comparePinyin(targetPinyin, recognized);

            console.log('识别文本:', recognized, '匹配分数:', score);

            return {
              success: true,
              score: score,
              recognized: recognized,
              isCorrect: score >= 0.7
            };
          } else {
            console.error('ASR 识别失败:', result.err_msg);
            // 识别失败，返回失败标记（不使用Math.random）
            return {
              success: false,
              reason: 'asr_empty'
            };
          }
        } catch (err) {
          console.error('recognizeVoice 错误:', err.message);
          // 出错时返回失败标记（不使用Math.random）
          return {
            success: false,
            reason: 'exception'
          };
        }
      }

      case 'getAudio': {
        // 百度 TTS 文字转语音
        const { char, pinyin } = data;
        console.log('getAudio called, char:', char, 'pinyin:', pinyin);

        try {
          // 获取 access token（复用一个）
          const accessToken = await getBaiduAccessToken();

          // 构造要发音的文本（汉字或拼音）
          const text = char || pinyin || '';

          // 调用百度 TTS API
          const ttsUrl = `https://tsn.baidu.com/text2audio?lan=zh&ctp=1&cuid=shizi&tok=${accessToken}&tex=${encodeURIComponent(text)}&vol=9&per=0&spd=5&pit=5&aue=3`;

          console.log('TTS URL:', ttsUrl);

          return {
            success: true,
            audioUrl: ttsUrl,
            message: 'ok'
          };
        } catch (err) {
          console.error('getAudio 错误:', err.message);
          return {
            success: false,
            error: err.message
          };
        }
      }

      case 'updateUserInfo': {
        // 更新用户昵称和头像（登录授权后调用）
        const { openid, nickname, avatar_url, avatarUrl } = data;
        if (!openid) {
          return { success: false, error: 'openid不能为空' };
        }

        const finalAvatar = avatar_url || avatarUrl || '';
        const updateData = { updated_at: new Date() };
        if (nickname) updateData.nickname = nickname;
        if (finalAvatar) updateData.avatar_url = finalAvatar;

        await db.collection('users').where({ openid }).update({ data: updateData });
        console.log('updateUserInfo success, openid:', openid, 'nickname:', nickname);
        return { success: true };
      }

      case 'getPhoneNumber': {
        // 使用 code 换取手机号（基础库 2.21.2+ 方式）
        const { code } = data;
        if (!code) {
          return { success: false, error: 'code不能为空' };
        }
        try {
          const accessToken = await getWxAccessToken();
          const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
          const result = await new Promise((resolve, reject) => {
            const postData = JSON.stringify({ code });
            const req = https.request(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
              }
            }, (res) => {
              let body = '';
              res.on('data', chunk => body += chunk);
              res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
              });
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
          });
          if (result.errcode === 0 && result.phone_info) {
            const phoneNumber = result.phone_info.phoneNumber;
            console.log('getPhoneNumber success:', phoneNumber);
            return { success: true, phoneNumber };
          } else {
            console.error('getPhoneNumber failed:', result);
            return { success: false, error: result.errmsg || '获取手机号失败' };
          }
        } catch (err) {
          console.error('getPhoneNumber error:', err.message);
          return { success: false, error: err.message };
        }
      }

      case 'getMasteredChars': {
        // 获取已掌握汉字列表
        console.log('=== getMasteredChars START ===');
        const { openid } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          console.log('=== getMasteredChars: user not found ===');
          return { success: true, data: { chars: [], total: 0 } };
        }

        const user = userRes.data[0];
        // 去重后获取已掌握ID列表（避免数据库中同一字被重复存储导致数量不一致）
        const masteredIds = [...new Set((user.mastered_chars || []).map(id => String(id)))];

        console.log('=== getMasteredChars: masteredIds ===', JSON.stringify(masteredIds));
        console.log('=== getMasteredChars: user._id ===', user._id);

        if (masteredIds.length === 0) {
          console.log('=== getMasteredChars: empty ===');
          return { success: true, data: { chars: [], total: 0 } };
        }

        // 获取所有汉字，在内存中过滤
        const charsRes = await db.collection('characters').limit(2256).get();
        const allChars = charsRes.data;

        console.log('=== getMasteredChars: total chars ===', allChars.length);
        console.log('=== getMasteredChars: first char sample ===', JSON.stringify(allChars[0]));

        // 过滤出已掌握的汉字（id 和 _id 都要匹配，字符串比较）
        const masteredChars = allChars.filter(c => {
          const idStr = String(c.id || '');
          const _idStr = String(c._id || '');
          return masteredIds.some(mid => String(mid) === idStr || String(mid) === _idStr);
        });

        console.log('=== getMasteredChars: matched chars count:', masteredChars.length);
        console.log('=== matched chars detail:', masteredChars.map(c => ({char: c.char, id: c.id, _id: c._id})));

        // 去重（根据 id 去重，id 优先）
        const uniqueChars = [];
        const seenIds = new Set();
        for (const c of masteredChars) {
          const id = c.id || c._id;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            uniqueChars.push(c);
          }
        }

        // 返回格式化数据
        return {
          success: true,
          data: {
            chars: uniqueChars.map(c => ({
              id: c.id || c._id,
              char: c.char,
              pinyin: c.pinyin
            })),
            total: uniqueChars.length
          },
          debug: {
            masteredIds: masteredIds,
            matchedCount: masteredChars.length,
            uniqueCount: uniqueChars.length
          }
        };
      }

      // ============================================================
      // V2.2: migrateProgress - 数据迁移
      // ============================================================
      case 'migrateProgress': {
        var migrateOpenid = data.openid;
        var migratedCount = 0;
        var skippedCount = 0;

        var migrateTodayObj = new Date();
        var migrateToday = migrateTodayObj.getFullYear() + '-' + String(migrateTodayObj.getMonth() + 1).padStart(2, '0') + '-' + String(migrateTodayObj.getDate()).padStart(2, '0');

        try {
          // 1. 获取 users 记录的 mastered_chars
          var migrateUserRes = await db.collection('users').where({ _openid: migrateOpenid }).get();
          if (!migrateUserRes.data || migrateUserRes.data.length === 0) {
            // 尝试用 openid 字段查询
            migrateUserRes = await db.collection('users').where({ openid: migrateOpenid }).get();
          }
          var migrateUser = migrateUserRes.data && migrateUserRes.data.length > 0 ? migrateUserRes.data[0] : null;
          var masteredCharsArr = migrateUser ? (migrateUser.mastered_chars || []) : [];

          // 2. 遍历 mastered_chars，为每个字创建 learning_progress（如果不存在）
          for (var mi = 0; mi < masteredCharsArr.length; mi++) {
            var mCharId = String(masteredCharsArr[mi]);
            try {
              var existRes = await db.collection('learning_progress')
                .where({ openid: migrateOpenid, char_id: mCharId })
                .get();

              if (existRes.data && existRes.data.length > 0) {
                skippedCount++;
              } else {
                // 旧"掌握"→ familiar+box3
                // 保守估计 correct_count=5（旧"掌握"意味着至少学过一次）
                var oldRecord = {
                  openid: migrateOpenid,
                  char_id: mCharId,
                  old_status: 'mastered',
                  correct_count: 5,
                  wrong_count: 0
                };
                var migratedRecord = migrateOldProgress(oldRecord, migrateToday);
                await db.collection('learning_progress').add({ data: migratedRecord });
                migratedCount++;
              }
            } catch (e) {
              console.error('migrateProgress char error:', mCharId, e.message);
              skippedCount++;
            }
          }

          // 3. 获取 learning_progress 中旧 status='learning' 的记录，执行 migrateOldProgress 更新
          try {
            var learningRes = await db.collection('learning_progress')
              .where({ openid: migrateOpenid, status: 'learning' })
              .get();

            for (var li = 0; li < learningRes.data.length; li++) {
              var learnRec = learningRes.data[li];
              try {
                var learnMigrateRecord = migrateOldProgress({
                  openid: migrateOpenid,
                  char_id: learnRec.char_id,
                  old_status: 'learning',
                  correct_count: learnRec.correct_count || 0,
                  wrong_count: learnRec.wrong_count || 0
                }, migrateToday);

                await db.collection('learning_progress').doc(learnRec._id).update({
                  data: {
                    box_level: learnMigrateRecord.box_level,
                    status: learnMigrateRecord.status,
                    next_review_date: learnMigrateRecord.next_review_date,
                    review_interval: learnMigrateRecord.review_interval,
                    recognition_correct: learnMigrateRecord.recognition_correct,
                    recall_correct: learnMigrateRecord.recall_correct,
                    cross_day_correct: learnMigrateRecord.cross_day_correct,
                    consecutive_correct: learnMigrateRecord.consecutive_correct,
                    consecutive_wrong: learnMigrateRecord.consecutive_wrong,
                    last_review_date: learnMigrateRecord.last_review_date,
                    last_correct_date: learnMigrateRecord.last_correct_date,
                    is_assisted: learnMigrateRecord.is_assisted,
                    updated_at: new Date()
                  }
                });
                migratedCount++;
              } catch (e) {
                console.error('migrateProgress learning update error:', learnRec._id, e.message);
                skippedCount++;
              }
            }
          } catch (e) {
            console.error('migrateProgress learning query error:', e.message);
          }

          return { success: true, migratedCount: migratedCount, skippedCount: skippedCount };
        } catch (err) {
          console.error('migrateProgress error:', err.message);
          return { success: false, error: err.message, migratedCount: migratedCount, skippedCount: skippedCount };
        }
      }

      // ============================================================
      // V2.2: getLearnChar - 获取单个字的详情+进度
      // ============================================================
      case 'getLearnChar': {
        var getCharOpenid = data.openid;
        var getCharId = data.charId;

        try {
          // 查询 characters 集合获取字详情
          var charInfo = null;
          try {
            var charDocRes = await db.collection('characters').doc(getCharId).get();
            if (charDocRes.data) {
              charInfo = charDocRes.data;
            }
          } catch (e) {
            // doc 查询失败，尝试用 id 字段查询
          }

          if (!charInfo) {
            var charAllRes = await db.collection('characters').limit(2256).get();
            for (var cai = 0; cai < charAllRes.data.length; cai++) {
              if (String(charAllRes.data[cai]._id) === String(getCharId) || String(charAllRes.data[cai].id) === String(getCharId)) {
                charInfo = charAllRes.data[cai];
                break;
              }
            }
          }

          if (!charInfo) {
            return { success: false, error: '汉字不存在' };
          }

          // 查询 learning_progress 获取学习进度
          var charProgress = null;
          try {
            var charProgressRes = await db.collection('learning_progress')
              .where({ openid: getCharOpenid, char_id: String(charInfo.id || charInfo._id) })
              .get();

            if (charProgressRes.data && charProgressRes.data.length > 0) {
              charProgress = charProgressRes.data[0];
            }
          } catch (e) {
            console.error('getLearnChar progress query error:', e.message);
          }

          // 无则创建默认进度
          if (!charProgress) {
            var defaultCharProgress = createDefaultProgress(getCharOpenid, String(charInfo.id || charInfo._id));
            try {
              await db.collection('learning_progress').add({ data: defaultCharProgress });
            } catch (e) {
              console.error('getLearnChar progress create error:', e.message);
            }
            charProgress = defaultCharProgress;
          }

          return {
            success: true,
            char: {
              id: charInfo.id || charInfo._id,
              char: charInfo.char,
              pinyin: charInfo.pinyin,
              strokes: charInfo.strokes || 0,
              words: charInfo.words || [],
              meaning: charInfo.meaning || '',
              image_url: charInfo.image_url || ''
            },
            progress: {
              box_level: charProgress.box_level || 1,
              status: charProgress.status || 'new',
              next_review_date: charProgress.next_review_date || '',
              review_interval: charProgress.review_interval || 1,
              correct_count: charProgress.correct_count || 0,
              wrong_count: charProgress.wrong_count || 0,
              recognition_correct: charProgress.recognition_correct || 0,
              recall_correct: charProgress.recall_correct || 0,
              cross_day_correct: charProgress.cross_day_correct || 0,
              consecutive_correct: charProgress.consecutive_correct || 0,
              consecutive_wrong: charProgress.consecutive_wrong || 0,
              last_review_date: charProgress.last_review_date || '',
              last_correct_date: charProgress.last_correct_date || '',
              is_assisted: charProgress.is_assisted || false
            }
          };
        } catch (err) {
          console.error('getLearnChar error:', err.message);
          return { success: false, error: err.message };
        }
      }

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (err) {
    console.error('云函数错误:', err);
    return { success: false, error: err.message };
  }
};

// 检查并解锁成就
async function checkAndUnlockAchievements(db, _, openid, masteredCount) {
  const unlockedRes = await db.collection('achievement_log').where({ openid }).get();
  const unlockedIds = unlockedRes.data.map(a => a.achievement_id);

  for (const ach of ACHIEVEMENTS) {
    if (!unlockedIds.includes(ach.id) && masteredCount >= ach.requirement) {
      // 解锁成就
      await db.collection('achievement_log').add({
        data: {
          openid,
          achievement_id: ach.id,
          unlocked_at: new Date()
        }
      });

      // 发放奖励 - 使用PRD定义的奖励
      const rewardType = ach.reward.type;
      const rewardAmount = ach.reward.amount;

      await db.collection('users').where({ openid }).update({
        data: {
          [rewardType + '_count']: _.inc(rewardAmount)
        }
      });

      await db.collection('reward_logs').add({
        data: {
          openid,
          reward_type: rewardType === 'star' ? 1 : 2,
          reward_amount: rewardAmount,
          source: 'achievement_' + ach.id,
          created_at: new Date()
        }
      });
    }
  }
}
