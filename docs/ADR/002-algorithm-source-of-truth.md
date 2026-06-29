# ADR-002: 算法真相源统一 (utils ↔ 云函数)

- **状态**: 实施 (V2.5.3)
- **日期**: 2026-06-29
- **决策者**: 王栋
- **审计来源**: 4 维度架构审计

## 背景

Leitner Box 算法 (`updateBoxLevel` / `updateMasteryStatus` / `calculatePriority` / `migrateOldProgress` / `createDefaultProgress`) 早期在 `cloudfunctions/main/index.js` 内嵌 230 行副本, 与 `utils/spaced-repetition.js` 双份维护。

V2.5.2 时 P0-1 修复 `M11` (`boxLevel=NaN` 防御) 只在 `utils/spaced-repetition.js` 加了, 云函数内嵌副本**没有这行**。`boxLevel=0` + 云函数路径会算出 NaN `nextReviewDate`, 优先级算法里混入 NaN 排序错乱。

**实际已经 drift**, 只是没在生产环境触发。

## 决策

**算法真相源 = `utils/spaced-repetition.js`**。云函数通过 `cloudfunctions/main/lib/spaced-repetition.js` 同步(目录内, 自包含, 满足云函数部署包自包含约束)。

部署流程:
1. 改 `utils/spaced-repetition.js` (单一源)
2. `npm run sync-utils` 同步到 `cloudfunctions/main/lib/`
3. CI 用 `npm run sync-utils:check` 阻断 drift
4. `npm test` 跑回归 (23 项, 覆盖 M11 + 5 档状态机 + 优先级等)
5. 上传云函数

## 备选方案

### 方案 A: 维持双份 (现状)
- **优点**: 部署包自包含, 简单
- **缺点**: 已经 drift 过(M11), 必然再 drift

### 方案 B: 云函数直接 `require('../../utils/...')`
- **优点**: 完全单一源
- **缺点**: 微信云函数部署包必须自包含, 跨目录 require 不支持, **不可行**

### 方案 C: 抽成 npm 包, 云函数 package.json 加依赖
- **优点**: 真正单一源, npm install 拉最新版
- **缺点**: 单文件算法不值得发包, 维护成本高; 仍需本地 link 或发布

### 方案 D (采用): 单一源 + 部署时 sync 到云函数 lib/
- **优点**: 真正单一源(改一个地方); sync 脚本和 CI check 防 drift
- **缺点**: sync 步骤必须在部署前跑(自动化成本低)

## 后果

- ✅ 单一真相源, 改一处生效一处
- ✅ 23 项回归测试覆盖核心算法
- ✅ M11 类 bug 复发概率降为 0
- ✅ 顺手修了 `getGrowthLevel` level 5 max=9999 fallback bug (测试发现)
- ⚠️ 部署流程多一步: `npm run sync-utils`
- ⚠️ CI 需配 `npm run sync-utils:check`

## 实施

- `utils/spaced-repetition.js`: 单一源 (含 `getGrowthLevel`)
- `cloudfunctions/main/lib/spaced-repetition.js`: 同步副本 (部署包自包含)
- `scripts/sync-utils-to-cloud.js`: hash 校验 + 同步, `--check` 模式
- `utils/spaced-repetition.test.js`: 23 项回归测试
- main/index.js: `require('./lib/spaced-repetition')` 解构 8 个函数, 删 230 行内嵌副本

## 后续

- 同样模式可推广到其他 utils 模块 (`delight.js` / `error-classifier.js` / `progressive-hint.js` / `question-types.js`), 但这些是前端用, 不需要进云函数 lib/
- 未来算法多时(> 5 个)考虑拆 npm 包, 现阶段单文件够用