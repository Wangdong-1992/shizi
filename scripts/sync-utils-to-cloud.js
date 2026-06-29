#!/usr/bin/env node
/**
 * sync-utils-to-cloud.js
 *
 * 把 utils/ 下的算法真相源同步到 cloudfunctions/main/lib/.
 *
 * 背景: 云函数部署包必须自包含, 不能 require ../../utils/.
 *   之前是把 utils/spaced-repetition.js 复制粘贴到 cloudfunctions/main/index.js
 *   作为内嵌副本, 2026-06-29 审计发现副本已与 utils drift (M11 boxLevel=NaN
 *   防御只在 utils).
 *
 * 用法: node scripts/sync-utils-to-cloud.js [--check]
 *   --check 只校验不写入, 适合 CI 步骤
 *
 * 同步完成后:
 *   - cloudfunctions/main/lib/spaced-repetition.js = utils/spaced-repetition.js
 *   - main/index.js 用 require('./lib/spaced-repetition') 单一引用
 *   - 上传云函数前必跑 (npm run sync 或部署脚本里调用)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const UTILS_DIR = path.join(ROOT, 'utils');
const CLOUD_LIB_DIR = path.join(ROOT, 'cloudfunctions', 'main', 'lib');

// 需要同步的文件 (utils/spaced-repetition.js → cloudfunctions/main/lib/spaced-repetition.js)
const SYNC_FILES = [
  'spaced-repetition.js'
];

function sha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function syncFile(filename, checkOnly) {
  const src = path.join(UTILS_DIR, filename);
  const dest = path.join(CLOUD_LIB_DIR, filename);

  if (!fs.existsSync(src)) {
    console.error(`[SKIP] 源文件不存在: ${src}`);
    return false;
  }

  // 确保目标目录存在
  if (!checkOnly && !fs.existsSync(CLOUD_LIB_DIR)) {
    fs.mkdirSync(CLOUD_LIB_DIR, { recursive: true });
  }

  const srcHash = sha256(src);
  const destExists = fs.existsSync(dest);
  const destHash = destExists ? sha256(dest) : null;

  if (destHash === srcHash) {
    console.log(`[OK]  ${filename} (hash 一致)`);
    return true;
  }

  if (checkOnly) {
    console.error(`[DRIFT] ${filename}`);
    console.error(`  src:  ${src}`);
    console.error(`  dest: ${dest}`);
    console.error(`  src hash:  ${srcHash}`);
    console.error(`  dest hash: ${destHash || '(file not found)'}`);
    return false;
  }

  fs.copyFileSync(src, dest);
  console.log(`[SYNC] ${filename} (已同步)`);
  return true;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  console.log(checkOnly ? '校验模式: 不写入' : '同步模式: 写入目标');

  let allOk = true;
  for (const file of SYNC_FILES) {
    if (!syncFile(file, checkOnly)) {
      allOk = false;
    }
  }

  if (checkOnly && !allOk) {
    console.error('\n❌ 检测到 drift, 请运行: node scripts/sync-utils-to-cloud.js');
    process.exit(1);
  }

  if (!checkOnly) {
    console.log(allOk ? '\n✅ 全部一致或已同步' : '\n⚠️ 部分文件失败, 检查日志');
  }
  process.exit(allOk ? 0 : 1);
}

main();