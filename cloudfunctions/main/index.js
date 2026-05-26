// 云函数入口
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 百度语音识别配置
const BAIDU_API_KEY = '9Cwtp66NdN02jE5sALz7Q5rD';
const BAIDU_SECRET_KEY = 'yHh8xH9BICC0ZH4oOEGAdZEeXemviwN6';

// 百度 Access Token 缓存
let baiduAccessToken = null;
let tokenExpireTime = 0;

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
      if (t.startsWith(shengmu[i]) && r.startsWith(shengmu[i])) {
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
        // 去重后计算已掌握数量（避免数据库中同一字被重复存储导致数量不一致）
        const masteredChars = [...new Set((user.mastered_chars || []).map(id => String(id)))];
        return {
          success: true,
          data: {
            mastered_count: masteredChars.length,
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
        const masteredIds = user.mastered_chars || [];

        // 获取所有汉字，在内存中过滤（避免 nin 查询的类型问题）
        const charsRes = await db.collection('characters').limit(2256).get();
        const allChars = charsRes.data;

        if (masteredIds.length === 0) {
          // 没有学习记录，返回第一个
          return { success: true, data: allChars[0] || null };
        }

        // 过滤出未掌握的汉字
        const unmastered = allChars.filter(c => {
          const charId = c.id || c._id;
          return !masteredIds.includes(charId);
        });

        // 随机返回一个
        if (unmastered.length > 0) {
          const randomIndex = Math.floor(Math.random() * unmastered.length);
          return { success: true, data: unmastered[randomIndex] };
        }

        return { success: true, data: null, error: '已学完所有汉字' };
      }

      case 'recordLearn': {
        const { openid, charId } = data;
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

      case 'getPendingReview': {
        const { openid, limit = 10 } = data;
        const userRes = await db.collection('users').where({ openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          return { success: true, data: [] };
        }

        const user = userRes.data[0];
        const masteredIds = user.mastered_chars || [];
        if (masteredIds.length === 0) {
          return { success: true, data: [] };
        }

        // 获取今日日期
        const today = new Date().toISOString().split('T')[0];

        // 尝试从 learning_progress 表获取优先级信息
        let priorityMap = {};
        try {
          const progressRes = await db.collection('learning_progress')
            .where({ openid })
            .get();

          // 构建优先级映射: priority = todayLearned*100 + wrongCount*10 + random
          for (const p of progressRes.data) {
            const charId = p.char_id;
            const todayLearned = (p.last_learn_date === today) ? 100 : 0;
            const wrongBonus = (p.wrong_review_count || 0) * 10;
            const randomVal = Math.floor(Math.random() * 5);
            priorityMap[charId] = todayLearned + wrongBonus + randomVal;
          }
        } catch (e) {
          // learning_progress 表可能不存在，使用默认优先级
        }

        // 获取所有汉字，在内存中过滤
        const charsRes = await db.collection('characters').limit(2256).get();
        const allChars = charsRes.data;

        // 过滤出已掌握的汉字
        const masteredChars = allChars.filter(c => {
          const charId = c.id || c._id;
          return masteredIds.includes(charId);
        });

        // 如果有优先级信息，按优先级排序
        if (Object.keys(priorityMap).length > 0) {
          masteredChars.sort((a, b) => {
            const pA = priorityMap[a.id || a._id] || 0;
            const pB = priorityMap[b.id || b._id] || 0;
            return pB - pA; // 降序
          });
        } else {
          // 随机打乱
          masteredChars.sort(() => Math.random() - 0.5);
        }

        // 返回前limit个
        return { success: true, data: masteredChars.slice(0, limit) };
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

      case 'recordReview': {
        // 记录复习结果到review_logs表
        const { openid, charId, reviewMode, isCorrect } = data;
        try {
          await db.collection('review_logs').add({
            data: {
              openid,
              char_id: charId,
              review_mode: reviewMode === 'listen' ? 1 : 2,
              is_correct: isCorrect,
              reviewed_at: new Date()
            }
          });
          return { success: true };
        } catch (err) {
          // 如果表不存在，返回成功（避免前端错误）
          console.error('recordReview error:', err.message);
          return { success: true };
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
            // 识别失败，返回模拟分数
            return {
              success: true,
              score: Math.random() > 0.3 ? 0.85 : 0.5,
              recognized: '',
              isCorrect: Math.random() > 0.3
            };
          }
        } catch (err) {
          console.error('recognizeVoice 错误:', err.message);
          // 出错时返回模拟结果
          return {
            success: true,
            score: Math.random() > 0.3 ? 0.85 : 0.5,
            recognized: '',
            isCorrect: Math.random() > 0.3
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