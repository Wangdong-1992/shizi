// 云函数入口 - 修复 mastered_chars 重复数据 + 退役字段清理
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 干跑: 列出将被 unset 的用户 (不动数据库)
 */
async function dryRunUnset(db) {
  const usersRes = await db.collection('users').limit(1000).get();
  const targets = [];
  for (const user of usersRes.data) {
    if (user.mastered_chars !== undefined) {
      targets.push({
        openid: user.openid,
        chars_count: (user.mastered_chars || []).length
      });
    }
  }
  return { total: usersRes.data.length, affected: targets.length, targets };
}

/**
 * 实际 unset mastered_chars 字段
 *  限制: 1000 用户/批 (云数据库单次 .update 1000 上限), 多批循环
 */
async function doUnset(db) {
  let total = 0;
  let batches = 0;
  while (true) {
    const batchRes = await db.collection('users')
      .where({ mastered_chars: db.command.exists(true) })
      .limit(100)
      .get();
    if (!batchRes.data || batchRes.data.length === 0) break;
    for (const user of batchRes.data) {
      await db.collection('users').doc(user._id).update({
        data: { mastered_chars: db.command.remove() }
      });
      total++;
    }
    batches++;
    if (batches > 100) break; // 防御性, 100 批=1万用户, 够了
  }
  return { unsetCount: total, batches };
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const action = event.action || 'dedup';

  try {
    // ============================================================
    // Action 1: 原有 — mastered_chars 数组去重
    // ============================================================
    if (action === 'dedup') {
      const usersRes = await db.collection('users').limit(1000).get();
      const users = usersRes.data;
      let fixedCount = 0;
      const results = [];
      for (const user of users) {
        const masteredChars = user.mastered_chars || [];
        if (masteredChars.length === 0) continue;
        const uniqueSet = new Set();
        for (const id of masteredChars) uniqueSet.add(String(id));
        const uniqueArr = Array.from(uniqueSet);
        if (uniqueArr.length !== masteredChars.length) {
          await db.collection('users').where({ openid: user.openid }).update({
            data: { mastered_chars: uniqueArr }
          });
          fixedCount++;
          results.push({ openid: user.openid, before: masteredChars.length, after: uniqueArr.length });
          console.log('修复用户', user.openid, ':', masteredChars.length, '->', uniqueArr.length);
        }
      }
      return { success: true, message: '修复完成，共修复 ' + fixedCount + ' 个用户', details: results };
    }

    // ============================================================
    // Action 2 (M9 二期, 2026-06-30): 退役 mastered_chars 字段
    //   适用: V2.5.3 后 mastered_chars 已是防御性 fallback, 不再被写入
    //   跑完 unset 后 users 集合不再有该字段
    //   V2.3 防御性 fallback 逻辑应同时降级 (无需读, 不报错)
    // ============================================================
    if (action === 'unsetMasteredChars') {
      const dryRun = event.dryRun !== false; // 默认 true, 安全
      if (dryRun) {
        return { success: true, mode: 'dry-run', ...(await dryRunUnset(db)) };
      }
      const result = await doUnset(db);
      return { success: true, mode: 'committed', ...result };
    }

    return { success: false, error: '未知 action: ' + action };
  } catch (err) {
    console.error('fixData error:', err);
    return { success: false, error: err.message };
  }
};