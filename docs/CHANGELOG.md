# CHANGELOG

> shizi 儿童识字小程序的项目变更日志。**只记版本级别**的变更(产品功能 / 数据模型 / 安全边界),不记具体 bug fix。
> 单个 bug fix 看 `git log --oneline`。
>
> 最近更新: **2026-06-29** (V2.5.3 审计 + 算法真相源重构)

---

## 版本表

| 版本 | 日期 | 主题 | PRD | 系统设计 |
|---|---|---|---|---|
| V2.5.3 | 2026-06-29 | 审计重构 (算法真相源 + 老字段退役 + TTS cache + 限流) | [V2.5.0](./儿童识字应用_PRD_V2.5.0.md) | [V2.3](./system_design_v23.md)(审计提及) |
| V2.5.2 | 2026-06-25 | P0/P1 大批量 bug 修复 (26 个) + B1 鉴权拦截 + dev tools 工具链 | [V2.5.0](./儿童识字应用_PRD_V2.5.0.md) | — |
| V2.5.1 | 2026-06-24 | 删除描红功能 (Step3), 学习页改三步流程 (释义→再认→跟读) | [V2.5.0](./儿童识字应用_PRD_V2.5.0.md) | [V2.4](./system_design_v24.md) (已废弃) |
| V2.5.0 | 2026-06-23 | 描红评分重做 (hanzi-writer 4-check 算法移植, 后被 V2.5.1 删除) | [V2.5.0](./儿童识字应用_PRD_V2.5.0.md) | — |
| V2.4.0 | 2026-06-09 | 描红字形贴合 (SVG path 底字 + 楷体 fallback + DTW 评分, 后被 V2.5.1 删除) | **(已废弃, 见 V2.5.0)** | [V2.4](./system_design_v24.md) |
| V2.3.0 | 2026-06-01 | P0 修复: 密钥剥离 + recordLearn 同步 learning_progress + getStats 一致性 | [V2.5.0](./儿童识字应用_PRD_V2.5.0.md) | [V2.3](./system_design_v23.md) |
| V2.2.0 | 2026-05-29 | 间隔重复引擎 (Leitner Box) + 四步递进学习 + 笔顺描红 (后被 V2.5.1 删除) | [V2.5.0](./儿童识字应用_PRD_V2.5.0.md) | [V2.2](./system_design_v22.md) |
| V2.1.0 | 2026-05-29 | ASR 降级选择题 + Math.random() 假阳性消除 | [V2.5.0](./儿童识字应用_PRD_V2.5.0.md) | [V2.1 (system_design.md)](./system_design.md) |
| V2.0.0 | 2026-05-28 | 愉悦体验全面升级 (delight.js 引擎 + 14 组关键帧动画) | [V2.5.0](./儿童识字应用_PRD_V2.5.0.md) | — |
| V1.6.0 | 2026-05-28 | 手机号授权登录 + 设置页头像昵称修改 + 默认头像 | — | — |
| V1.5.1 | 2026-05-27 | 登录授权修复 (废弃 getUserInfo → chooseAvatar + nickname + 云存储上传) | — | — |
| V1.0.0 | 2026-05-14 | 初始版本 | — | — |

---

## 主要变更叙述

### V2.5.3 (2026-06-29) — 审计重构

**触因**: 4 维度架构审计 (架构 / 依赖 / 代码质量 / 文档对应) 发现 3 个 P0 + 1 个 P1 风险。

**核心改动**:
1. **算法真相源统一**: `utils/spaced-repetition.js` 同步到 `cloudfunctions/main/lib/spaced-repetition.js`, main/index.js 删除 233 行内嵌副本, 改用 require. 配 `scripts/sync-utils-to-cloud.js` (hash 校验 + 同步) 和 `utils/spaced-repetition.test.js` (23 项回归测试).
2. **老字段退役**: `recordLearn` 不再 push `users.mastered_chars`, 改用 `learning_progress` 判定"是否首次学". 解决了"已掌握但不进复习队列"的双源不一致路径.
3. **TTS 性能与防护**: TTS URL 24h 永久 cache (~4500 种 char+pinyin 组合), ASR/TTS 按 IP 限流 (60/min TTS, 30/min ASR). 防止恶意调用刷爆百度配额.
4. **算法 bug 修复**: `getGrowthLevel` level 5 max 从 9999 改为 Infinity, 修复 >9999 字时 fallback 到 level 1 的边界 bug.

**影响**:
- 云函数 main 缩 233 行 (-10%)
- 测试覆盖: 0 → 23 项核心算法
- TTS 调用频次预估降 90%+ (cache 命中)

---

### V2.5.2 (2026-06-25) — P0/P1 大批量修复

**触因**: V2.5.1 上线后, P0/P1 bug 集中暴露 (共 26 个).

**核心改动**:
1. **B1 云函数鉴权**: 21 个 action 入口强制 `wxContext.OPENID` 校验, `PUBLIC_ACTIONS` 白名单 (`getOptions` / `getQuestionOptions` / `getAudio` 无需 openid), dev tools 走 `DEV_OPENIDS` 白名单.
2. **dev tools 工具链**: `app.js` 检测 `envVersion === 'develop'` 自动给 `wx.cloud.callFunction` 注入 `devMode: true`.
3. **P0 修复 12 个**: 鉴权 / 日志脱敏 / 数据一致性 / 老字段退役 / 前端 UX.
4. **P1 修复 10 个**: review onUnload 清理录音 / settings switch 回滚 / mastered 刷新 + 网络错误 / 状态机 batch reset / 录音 timer / streak 跳天 / boxLevel NaN 防御.

**详细 bug 列表**: 见 [PRD V2.5.0 §14 已修复Bug索引](./儿童识字应用_PRD_V2.5.0.md#十四已修复bug索引).

---

### V2.5.1 (2026-06-24) — 删描红

学习页从四步流程 (释义→再认→**描红**→跟读) 改三步流程 (释义→再认→跟读). 删描红是用户决策 (PoC 8 轮集成失败 + 算法移植后功能未被需要).

PRD 保留 Step4 内部编号以避免文档断链.

---

### V2.5.0 (2026-06-23) — 描红评分重做 (后废)

hanzi-writer 4-check 算法移植到 `utils/stroke-grader.js`. 坐标系修正 (CSS 像素 → userLogical). 47 项单测全过. V2.5.1 删描红后该模块被移除.

---

### V2.4.0 (2026-06-09) — 描红字形贴合 (后废)

SVG path 底字 + 系统楷体 fallback + 按年龄容差 DTW 评分. V2.5.1 删描红后废弃. [system_design_v24.md](./system_design_v24.md) 仅作历史参考.

---

### V2.3.0 (2026-06-01) — P0 救火 + 加固

**触因**: V2.2 上线后 4 个 P0 致命问题暴露.

**核心改动**:
1. **密钥剥离**: `cloudfunctions/main/index.js` 第 9-14 行硬编码密钥全部移到 `process.env`, 启动时 `if (!xxx) throw` 拒绝启动.
2. **recordLearn 同步 learning_progress**: V2.2 上线时漏了这个写入, 导致新字不进复习队列.
3. **getStats / getMasteredChars 改用 learning_progress**: 消除 V2.1 假阳性污染的 `mastered_chars` 数组. 但**写入路径未关**, 直到 V2.5.3 才彻底关闭 (audit 发现的 drift).
4. **客户端 TTS 重试**: 新建 `utils/audio.js`, 百度 token 偶发失效时自动重试 1 次.

---

### V2.2.0 (2026-05-29) — 间隔重复引擎

核心机制变更:
- **Leitner Box** (5 档, 间隔 [1, 3, 7, 14, 30] 天): `utils/spaced-repetition.js`
- **五级掌握状态机** (new → seeing → familiar → mastered → solid)
- **优先级算法** (urgency × 0.5 + difficulty × 0.3 + random × 0.2)
- **四步递进学习页** (释义 → 再认 → 描红 → 跟读) — 后被 V2.5.1 删描红改为三步
- **recordReview 三写闭环**: review_logs + learning_progress + 状态机

---

### V2.1.0 (2026-05-29) — ASR 降级 + 假阳性消除

修复 V2.0 中 56% 的假阳性 ASR 判定 (review.js L386 `Math.random() > 0.3`):
- ASR 失败降级为选择题 (不是跳过 / 随机)
- `is_assisted` + `data_quality` 字段标记可疑数据

---

### V2.0.0 (2026-05-28) — 愉悦体验引擎

- `utils/delight.js`: 14 组关键帧动画 + 触感震动 + 星星粒子 + 烟花 + 鼓励语
- 3 个页面 (首页 / 学习 / 复习) 全动画改造

---

### V1.0.0 ~ V1.6.0 (2026-05-14 ~ 05-28) — 基础版本

早期版本, 已并入 V2.0.0 叙事. 详见 git log.

---

## 归档 / 删除的文档

| 文档 | 状态 | 原因 |
|---|---|---|
| `docs/儿童识字应用_PRD_V2.0.0.md` | **已删除 (V2.5.3)** | V2.0 内容已被 V2.5.0 完全覆盖, 顶部 banner 已声明归档 |
| `docs/儿童识字应用_PRD_V2.4.0.md` | **已删除 (V2.5.3)** | V2.4 描红字形贴合 已被 V2.5.1 删除, 文档内容无意义 |
| `docs/system_design_v22.md` | 保留为历史参考 | V2.2 间隔重复引擎设计, 算法部分已 V2.5.3 重构 (真相源同步), 但设计取舍仍可参考 |
| `docs/system_design_v23.md` | 保留为历史参考 | V2.3 P0 修复设计, B1 鉴权在 V2.5.2 加, 需读时关注 |
| `docs/system_design_v24.md` | 保留为历史参考 | V2.4 描红字形贴合, V2.5.1 已废弃 |
| `docs/system_design.md` (V2.1) | 保留为历史参考 | V2.1 ASR 降级设计 |
| `docs/archive/` | 保留 | 描红功能调研横纵分析报告, 设计调研资料 |
| `deliverables/product-strategy/*.md` (3 份) | 保留 | 2026-05-29 战略团队报告, V2.5.2 banner 已加, 正文 V2.1 时代规划历史保留 |

---

## 云函数 action 清单 (V2.5.3 = 22 个)

**入口鉴权模式** (B1): 入口强制 `wxContext.OPENID` 校验.
- **PUBLIC_ACTIONS 白名单** (3 个, 无需 openid): `getOptions`, `getQuestionOptions`, `getAudio`
- **devMode + DEV_OPENIDS 白名单** (仅 dev tools, 需配云函数环境变量)
- **生产路径**: `data.openid === wxContext.OPENID` 严格相等

### 22 个 action 分组

| 类别 | action |
|---|---|
| 用户 / 认证 (5) | `wxLogin`, `getUser`, `updateUserInfo`, `getPhoneNumber`, `subscribeReminder` |
| 学习核心 (3) | `getNextChar`, `recordLearn`, `getLearnChar` |
| 复习核心 (4) | `getPendingReview`, `getOptions` *, `getQuestionOptions` *, `recordReview` |
| 统计 / 成就 (4) | `getStats`, `getDailyStats`, `getAchievements`, `getMasteredChars` |
| 语音 / 百度 (2) | `recognizeVoice`, `getAudio` * |
| 运维 (4) | `migrateProgress`, `sendReviewReminder`, `cleanReviewLogs`, `resetUserData` |

\* PUBLIC_ACTIONS 白名单 (无需鉴权)

### 早期版本计数不一致已修正

历史上有 "21 / 22 / 23" 多种说法:
- "23": V2.4 阶段 2 时, 包含 V2.3 的 22 个 + 新增的 `getLearnChar` (1个), 实际是当时的过渡版本, 已与 V2.5 同步
- "22": 当前正确值 (V2.5.3)
- "21": 早于 `getLearnChar` 添加时的过时计数

**所有文档已统一为 22**.