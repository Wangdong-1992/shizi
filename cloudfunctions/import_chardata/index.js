const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const BATCH_SIZE = 200; // 每批处理数量

exports.main = async (event, context) => {
  const { action, data } = event;

  if (action === 'import') {
    // Node 12 不支持可选链 ?. —— 用传统 && 写法(node 14+ 可改回 ?.)
    const offset = (data && data.offset) || 0;
    const limit  = (data && data.limit)  || BATCH_SIZE;
    return await importCharacters(offset, limit);
  }

  if (action === 'check') {
    return await checkStatus();
  }

  if (action === 'reset') {
    return await resetAndImport();
  }

  return { success: false, error: 'Unknown action' };
};

async function checkStatus() {
  try {
    const countResult = await db.collection('characters').count();
    return { success: true, total: countResult.total };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 下载文件
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function resetAndImport() {
  try {
    const jsonUrl = 'https://cloud1-d7geippqn581097e3-1434471397.tcloudbaseapp.com/C:/Program%20Files/Git/data/chars.json';

    console.log('Downloading JSON...');
    const fileContent = await downloadFile(jsonUrl);
    const chars = JSON.parse(fileContent);

    console.log(`Read ${chars.length} characters`);

    // 清空现有数据
    console.log('Clearing existing records...');
    const existing = await db.collection('characters').limit(1000).get();
    for (const c of existing.data) {
      try {
        await db.collection('characters').doc(c._id).remove();
      } catch (e) {}
    }

    // 分批插入
    let inserted = 0;
    for (let i = 0; i < chars.length; i += BATCH_SIZE) {
      const batch = chars.slice(i, i + BATCH_SIZE);
      const docs = batch.map(c => ({
        id: c.id,
        char: c.char,
        pinyin: c.pinyin
      }));

      try {
        for (const doc of docs) {
          await db.collection('characters').add({ data: doc });
          inserted++;
        }
        console.log(`Inserted ${inserted}/${chars.length}`);
      } catch (err) {
        console.error(`Batch error at ${i}:`, err.message);
      }
    }

    const finalCount = await db.collection('characters').count();
    return { success: true, inserted, total: finalCount.total };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function importCharacters(offset = 0, limit = BATCH_SIZE) {
  try {
    const jsonUrl = 'https://cloud1-d7geippqn581097e3-1434471397.tcloudbaseapp.com/C:/Program%20Files/Git/data/chars.json';

    console.log(`Importing from offset ${offset}, limit ${limit}`);
    const fileContent = await downloadFile(jsonUrl);
    const chars = JSON.parse(fileContent);

    const endIndex = Math.min(offset + limit, chars.length);
    const batch = chars.slice(offset, endIndex);

    console.log(`Processing ${batch.length} chars (${offset} to ${endIndex})`);

    let inserted = 0;
    for (const char of batch) {
      try {
        await db.collection('characters').add({
          data: {
            id: char.id,
            char: char.char,
            pinyin: char.pinyin
          }
        });
        inserted++;
      } catch (err) {
        console.error(`Error inserting char ${char.id}:`, err.message);
      }
    }

    const progress = {
      offset: endIndex,
      inserted,
      total: chars.length,
      percent: Math.round((endIndex / chars.length) * 100)
    };

    console.log(`Progress: ${endIndex}/${chars.length} (${progress.percent}%)`);

    // 如果还没完成，返回进度信息
    if (endIndex < chars.length) {
      return {
        success: true,
        status: 'in_progress',
        ...progress
      };
    }

    // 完成
    const finalCount = await db.collection('characters').count();
    return {
      success: true,
      status: 'completed',
      inserted: endIndex,
      total: finalCount.total
    };
  } catch (err) {
    console.error('Import error:', err);
    return { success: false, error: err.message };
  }
}