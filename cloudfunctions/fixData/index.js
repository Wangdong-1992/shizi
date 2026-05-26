// 云函数入口 - 修复 mastered_chars 重复数据
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;

  try {
    // 获取所有用户
    const usersRes = await db.collection('users').limit(1000).get();
    const users = usersRes.data;

    let fixedCount = 0;
    const results = [];

    for (const user of users) {
      const masteredChars = user.mastered_chars || [];

      if (masteredChars.length === 0) continue;

      // 去重：使用 Set 按字符串 id 去重
      const uniqueSet = new Set();
      for (const id of masteredChars) {
        uniqueSet.add(String(id));
      }

      const uniqueArr = Array.from(uniqueSet);

      // 如果有重复，进行修复
      if (uniqueArr.length !== masteredChars.length) {
        await db.collection('users').where({ openid: user.openid }).update({
          data: {
            mastered_chars: uniqueArr
          }
        });

        fixedCount++;
        results.push({
          openid: user.openid,
          before: masteredChars.length,
          after: uniqueArr.length
        });

        console.log(`修复用户 ${user.openid}: ${masteredChars.length} -> ${uniqueArr.length}`);
      }
    }

    return {
      success: true,
      message: `修复完成，共修复 ${fixedCount} 个用户`,
      details: results
    };
  } catch (err) {
    console.error('修复失败:', err);
    return {
      success: false,
      error: err.message
    };
  }
};