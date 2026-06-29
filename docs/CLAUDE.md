# 儿童识字应用 - 项目约定

## 项目概述

面向幼儿园儿童（3-6岁）的汉字学习应用，核心目标教会2256个常用汉字。

**技术栈：**
- 微信小程序云开发（云函数 + 云数据库）
- 前端：原生 WXML/WXSS/JS（ES5兼容语法）
- 语音：百度语音识别 API（TTS + ASR）
- 云环境：`cloud1-d7geippqn581097e3`
- AppID：`wxa2bbfca6b9ef6ebd`

## 项目结构

```
E:/claude/PMRD/shizi/
├── docs/                              # 产品文档
│   ├── 儿童识字应用_PRD_V2.5.0.md      # 产品需求文档（当前版本）
│   ├── 一级字表_拼音.xlsx              # 2256字原始数据
│   └── CLAUDE.md                      # 本文件（项目约定）
├── pages/                             # 页面目录
│   ├── index/                         # 首页
│   ├── learn/                         # 学习页
│   ├── review/                        # 复习页
│   ├── profile/                       # 个人中心
│   ├── mastered/                      # 已掌握汉字列表
│   └── settings/                      # 设置页
├── scripts/
│   └── smoke-test.js                  # 冒烟测试
├── utils/
│   ├── delight.js                      # V2.0 愉悦体验引擎
│   ├── spaced-repetition.js            # V2.2 间隔重复算法模块
│   ├── audio.js                        # V2.3 TTS自动重试
│   ├── progressive-hint.js             # V2.3 渐进提示
│   └── error-classifier.js            # V2.3 错因分类
├── cloudfunctions/                    # 云函数
│   ├── login/                         # 获取openid
│   ├── main/                          # 主业务逻辑（22个action，V2.5.1起无描红）
│   ├── fixData/                       # 数据修复
│   └── import_chardata/             # 汉字数据导入
├── images/                            # TabBar图标
├── app.js                             # 应用入口
├── app.json                           # 全局配置
└── app.wxss                           # 全局样式
```

## 云数据库集合

| 集合名 | 说明 |
|--------|------|
| users | 用户数据（openid识别） |
| characters | 汉字数据（2256字） |
| achievement_log | 成就记录（无s） |
| reward_logs | 奖励记录 |
| review_logs | 复习记录 |
| learning_progress | 学习进度 |

**characters 集合结构：**
```json
{ "_id": "xxx", "id": 1, "char": "一", "pinyin": "yī" }
```

**users 集合结构：**
```json
{
  "openid": "xxx",
  "nickname": "小明",
  "avatar_url": "",
  "star_count": 0,
  "flower_count": 0,
  "streak_count": 0,
  "mastered_chars": [],
  "last_learn_date": "",
  "token": "xxx",
  "token_expire": "Date",
  "age": null,                    // V2.4 宝宝年龄(3-6,null 表示未设置,前端 fallback 5 岁)
  "push_subscribed": false,       // R-15 复习提醒订阅
  "max_combo": 0                  // R-14 个人最佳连击
}
```

## 奖励机制

| 场景 | 奖励 |
|------|------|
| 单字学习完成（3次跟读正确） | 星星x1 |
| 连续学习10字 | 星星x3 |
| 连续学习50字 | 小红花x1 |
| 复习全对 | 小红花x1 |

## 成就系统

| 成就ID | 名称 | 条件 | 奖励 |
|--------|------|------|------|
| ACH001 | 初次识字 | 1字 | 星星x3 |
| ACH002 | 小小学生 | 50字 | 星星x10 |
| ACH003 | 认字小达人 | 200字 | 小红花x2 |
| ACH004 | 认字小高手 | 500字 | 小红花x5 |
| ACH005 | 汉字小博士 | 1000字 | 小红花x10 |
| ACH006 | 汉字小状元 | 2000字 | 小红花x20 |
| ACH007 | 汉字小天才 | 3500字 | 小红花x50 |

## 云函数接口 (main)

> **当前数量：22 个 action**（V2.5.3）。所有业务逻辑统一在 `cloudfunctions/main/index.js` 的 switch 路由里，按"用户/学习/复习/统计/语音/运维"六类分。详细分组见 [docs/CHANGELOG.md](./CHANGELOG.md#22-个-action-分组)。

| action | 说明 | 参数 |
|--------|------|------|
| **用户/认证** | | |
| `wxLogin` | 微信登录（code换openid + 生成token） | { code, nickname, avatar } |
| `getUser` | 获取用户信息 | { openid } |
| `updateUserInfo` | 更新用户信息（头像/昵称） | { openid, nickname, avatar_url/avatarUrl } |
| `getPhoneNumber` | 微信手机号解密 | { code } |
| `subscribeReminder` | 订阅/取消复习提醒 | { openid, subscribed } |
| **学习核心** | | |
| `getNextChar` | 获取下一个待学汉字（新字路径） | { openid } |
| `getLearnChar` | 获取字详情+笔顺+学习进度 | { openid, charId } |
| `recordLearn` | 记录学习完成 + 奖励 + **同步创建 learning_progress**（V2.3 修复） | { openid, charId, isAssisted } |
| **复习核心** | | |
| `getPendingReview` | 获取待复习列表（V2.2 优先级算法） | { openid, limit } |
| `getOptions` | 获取听音选字选项（兼容旧调用） | { charId, shapeSimilar } |
| `getQuestionOptions` | 获取指定题型选项（V2.3，5 种题型） | { charId, questionType } |
| `recordReview` | 记录复习结果（三写：review_logs + learning_progress + 状态机） | { openid, charId, reviewMode, isCorrect, isAssisted, asrScore, exerciseType, errorType } |
| **统计/成就** | | |
| `getStats` | 用户统计 + 成长等级 + 每日进度（V2.3 改用 learning_progress 查"已掌握"） | { openid } |
| `getDailyStats` | 今日新字 + 待复习 + 配额判断 | { openid } |
| `getAchievements` | 成就列表 | { openid } |
| `getMasteredChars` | 已掌握汉字列表（V2.3 改用 learning_progress.status in [familiar,mastered,solid]） | { openid } |
| **语音/百度** | | |
| `recognizeVoice` | 百度语音识别（ASR） | { fileID, targetPinyin } |
| `getAudio` | 百度 TTS 发音 | { char, pinyin } |
| **运维** | | |
| `migrateProgress` | 旧数据按需迁移（mastered_chars → learning_progress familiar） | { openid } |
| `cleanReviewLogs` | R-16 清洗 V2.1 之前的假阳性 review_logs（打 `data_quality="unreliable_pre_fix"` 标签） | { cutoffDate, dryRun, batchSize } |
| `sendReviewReminder` | 定时器触发，订阅用户推送复习提醒 | （定时器或手动） |
| `resetUserData` | **V2.3 危险操作**：清空当前用户所有学习数据。生产路径用 `{ confirm: true }`（用 wxContext.OPENID 锁定）；云端调试需 `{ devMode: true, openid, confirm: true }` | { confirm, devMode?, openid? } |

## V2.0 愉悦体验引擎 (utils/delight.js)

| API | 说明 |
|-----|------|
| `vibrate(type)` | 触感反馈（light/medium/heavy） |
| `shake(page, key)` | 元素抖动效果 |
| `countUp(page, key, target)` | 单数字滚动动画 |
| `countUpBatch(page, items)` | 批量数字滚动（items: [{key, value}]） |
| `burstStars(page)` | 星星粒子特效 |
| `burstConfetti(page)` | 烟花庆祝特效 |
| `getComboLevel(n)` | 连击等级（3连🔥 / 5连🔥🔥 / 7连🔥🔥🔥） |
| `getRandomPraise()` | 随机鼓励语 |
| `getRandomEncourage()` | 随机温和鼓励 |
| `playSound(type)` | 音效振动（success/wrong） |

**页面动画清单：**
- 首页：entranceSlideUp（分区入场）+ badgePulse（成就脉冲）+ 数字滚动
- 学习页：cardBounceIn（卡片弹性）+ rippleExpand（录音波纹）+ starFloat（星星粒子）+ confettiFall（烟花）+ feedbackPopIn（反馈弹窗）
- 复习页：comboPopIn（连击徽章）+ superComboGlow（超级发光）+ correctPop/wrongShake（选项反馈）

## V2.3 新增工具

### utils/audio.js（TTS 拉取 + 自动重试）

百度 TTS 直链带一次性 `access_token`，云函数内部 token 偶尔失效会导致音频播放失败。`utils/audio.js` 抽出来统一处理：

| API | 说明 |
|-----|------|
| `fetchTTS(char, pinyin, retryLeft, onSuccess, onFail)` | 拉音频 URL，失败按 retryLeft 递归重试 |
| `playTTS(char, pinyin, onFallback)` | 便捷方法：拉 URL → 播放 → 失败走 onFallback，内部默认重试 1 次 |

**调用方：** `learn.js` 的 `playAudio` / `playMiniReviewAudio`，`review.js` 的 `playAudio` 都改用 `TTS.playTTS`，遇到 token 失效会自动重试一次，第二次失败才走 fallback（显示拼音文字）。

### pages/learn/learn.js — `resetLearnStateMachine()`

**切字前**必须调用的公共重置方法。`loadChar()`（新字学习）和 `checkMasteredChar()`（从已掌握页面进入）都通过 `Object.assign` 调它。

```js
// 用法
this.setData(Object.assign({
  // 自己特有的字段（如 loading=true/false、字本身）
  ...
}, this.resetLearnStateMachine()));
```

**它重置的字段**（25+ 个，统一收口，未来新增"切字时需要清零"的字段只在这里加一次）：
- 四步状态机本体：`currentStep / stepCompleted / stepResults / learnCompleted / finalResult / feedbackShow`
- Step2 再认：`step2Options / step2Answered / step2Correct / step2SelectedId`
- Step4 跟读：`step4Correct / step4Answered / asrFailed / asrProcessing / showChoiceMode / choiceOptions`
- V2.3 渐进提示：`charErrorCount / showProgressiveHint / progressiveHintText / progressiveHintLevel`
- R-13 每日配额：`dailyQuotaReached / dailyQuotaReason`

**为什么需要它：** 修复 V2.2 上线后"上一个字学完直接进入下一个字时残留 learnCompleted=true"导致的"学会了"弹窗 bug（V2.3 修复 1）。

## 已完成功能

- [x] 云函数部署（login, main）
- [x] 云数据库集合创建（users, characters, achievement_log, reward_logs, review_logs, learning_progress）
- [x] 汉字数据导入（2256字）
- [x] TabBar图标 + 首页/学习页/复习页/个人中心
- [x] 语音发音（百度TTS，getAudio）
- [x] 跟读识别（百度ASR，recognizeVoice）
- [x] 复习页完整功能（听音选字、看字说音）
- [x] 已掌握汉字列表页（mastered）
- [x] 设置页（settings）- 关于我们、退出登录
- [x] 成就奖励计算修复
- [x] 登录页UI改版（微信绿色按钮+隐私协议）
- [x] wxLogin云函数（token生成，7天有效期）
- [x] 微信昵称和头像授权登录（V1.4.0）
- [x] 严选风格登录页改造（V1.5.0）：全屏渐变+漂浮汉字+底部卡片
- [x] 登录授权修复（V1.5.1）：废弃getUserInfo → chooseAvatar + nickname input + 头像云存储上传
- [x] 手机号授权登录 + 设置页头像昵称修改（V1.6.0）：getPhoneNumber + 默认头像昵称 + 设置页可修改
- [x] 愉悦体验全面升级（V2.0.0）：utils/delight.js + 三页面动画改造 + 14组关键帧动画
- [x] ASR降级选择题 + Math.random()假阳性消除（V2.1）：learn.js/review.js/云函数三处随机fallback修复
- [x] 间隔重复引擎（V2.2）：utils/spaced-repetition.js + Leitner Box (1-5级) + 五级掌握状态机 + 优先级调度
- [x] 四步递进学习页重构（V2.2）：释义→再认→描红→跟读，单页状态机
- [x] 复习页适配（V2.2）：Box升降反馈 + 状态变迁提示 + exerciseType参数
- [x] 旧数据按需迁移（V2.2）：migrateProgress云函数，首页首次访问触发
- [x] 云函数 recordReview 三写闭环：review_logs + learning_progress + 状态信息返回
- [x] **V2.3 P0 修复**：密钥从代码中剥离，改用云函数环境变量
- [x] **V2.3 P0 修复**：recordLearn 同步创建 learning_progress（之前漏，导致新字不进复习队列）
- [x] **V2.3 P0 修复**：getStats / getMasteredChars 改用 learning_progress 计算，过滤 V2.1 假阳性
- [x] **V2.3 P0 修复**：客户端 getAudio 自动重试，新建 utils/audio.js
- [x] **V2.3**：云函数新增 resetUserData action（清空当前用户学习数据）
- [x] **V2.3**：settings 页加 "清除学习数据" 按钮（带二次确认）
- [x] **V2.3 架构优化**：pages/learn/learn.js 抽出 resetLearnStateMachine 公共方法，loadChar / checkMasteredChar 共用
- [x] **V2.5.1**：删除描红功能（Step3），学习页改为三步流程（释义→再认→跟读）
- [x] **V2.5.2 P0 修复（12 个）**：B1 云函数鉴权拦截 + B3/B4 日志脱敏 + B5/B6 数据一致性 + B7/B8 老字段退役 + B9-B12 前端 UX
- [x] **V2.5.2 P1 修复（10 个）**：M1 review onUnload 清理录音 + M2 settings switch 回滚 + M4/M5 mastered 刷新+网络错误 + M6/M8 状态机 batch reset 抽取 + M7 录音 timer 泄漏 + M10 streak 跳天重置 + M11 boxLevel NaN 防御
- [x] **V2.5.2 现场修复**：`去复习`按钮 navigateTo→switchTab、loadOptions 静默失败加 toast、comboLevel undefined setData、首页 spinner 卡死 8s 兜底超时
- [x] **V2.5.2 dev tools 工具**：app.js 自动注入 `devMode: true`(envVersion='develop' 检测),B1 鉴权 + PUBLIC_ACTIONS 白名单 + DEV_OPENIDS 白名单支持 dev tools 调试

## 已修复Bug

### mastered_chars 计数不一致（首页与列表页数量不同）

**现象（V2.2 上线时）**：
- `getStats` 数数组 = 7，`getMasteredChars` 交叉比对 = 6（悬空ID）
- 后 `getStats` 改纯去重 → 首页变7、列表仍是6（不一致）
- 又现 `countUpBatch` 参数名 bug → 首页始终显示0

**2026-05-28 修复方案**：
1. **云函数** `getStats` 改用与 `getMasteredChars` 完全一致的算法：去重 → 查 characters 表 `id`/`_id` 双向匹配 → 再去重 → 计数
2. **前端** `utils/delight.js:103` `countUpBatch` 参数名修复：`item.target` → `item.value || item.target`

**2026-06-01 V2.3 二次修复**（同源 bug，本质根除）：
- `getStats` 和 `getMasteredChars` **统一改为用 `learning_progress.status in [familiar, mastered, solid]` 查"已掌握"**
- 不再依赖 `users.mastered_chars` 数组（V2.1 假阳性的源头）
- 两边用完全相同的查询条件 + Set 去重，**首页和列表页从此不再可能不一致**

### profile 头像 cloud:// 路径乱码

**修复**：profile.js 检测 `cloud://` → `wx.cloud.getTempFileURL()` 转临时 HTTPS 链接 → WXML 条件渲染

### tabBar 页面二次进入时 fromMasteredChar 不消费（V2.3 修复 1）

**现象**：从"已掌握"列表点字进入 learn 页，无论选哪个字都显示"一"字。

**根因**：
- `learn` 是 tabBar 页面。微信 tabBar 页面生命周期：**首次进入** 触发 `onLoad`+`onShow`，**二次进入** 只触发 `onShow`，**不再触发 `onLoad`**
- 第一次进 learn 时已设过 `currentChar`，导致 `onShow` 中的判断 `!this.data.currentChar && !this.data.loading` 一直为 false，**`fromMasteredChar` 永远不被消费**

**修复**：`onShow` 优先消费 `app.globalData.fromMasteredChar`，再走老逻辑。

### 切字时四步状态机残留（V2.3 修复 2）

**现象**：在已掌握里学完一个字"工"后，再点其他字进入学习页，**直接显示"学会了"庆祝弹窗**，四步流程全跳过。

**根因**：`checkMasteredChar` 只更新字本身，**没有重置 `learnCompleted / currentStep / stepCompleted / stepResults / feedbackShow` 等 25+ 个状态字段**。

**修复**：抽出公共方法 `resetLearnStateMachine()`，`loadChar` 和 `checkMasteredChar` 都通过 `Object.assign` 调它。详见上方"V2.3 新增工具"章节。

### dailyQuotaReached 残留（V2.3 修复 3）

**现象**：新字学习模式学完触发"今日新字已达标"卡片后，从已掌握点其他字进入，卡片仍残留。

**根因**：之前把 `dailyQuotaReached / dailyQuotaReason` 留在 `loadChar` 私有重置里，`checkMasteredChar` 没重置。

**修复**：归到公共 `resetLearnStateMachine()`。

### getStats 走降级路径返回老数据（V2.3 修复 4）

**现象**：迁移后的用户首页"已掌握"显示 9，进入列表页只显示 1。

**根因**：`db.collection().where({...}).count()` 配合 `_.in([...])` 抛异常，触发降级逻辑，用 `mastered_chars` 数组长度（旧数据）兜底返回 9。

**修复**：`getStats` 改用 `.where().get().length`（去重后算 unique char_id 数），不用 `.count()`。

### V2.5.2 修复批次（2026-06-24 ~ 06-25，共 26 个）

**安全 / 鉴权（B1）**：19 个用户 action 信任客户端 `data.openid` → switch 入口强制 `wxContext.OPENID` 校验 + `PUBLIC_ACTIONS` 白名单（`getOptions`/`getQuestionOptions`/`getAudio` 无需 openid）+ `devMode + DEV_OPENIDS` 白名单 dev tools 调试。22 个 action 中除 PUBLIC_ACTIONS 3 个外,其余 19 个走鉴权。

**隐私日志（B3/B4）**：`getPhoneNumber` 手机号 `前3+****+后4` 脱敏；`wxLogin` 不再打印 token 明文。

**数据一致性（B5/B6）**：`recordLearn` 的 `learning_progress` 失败时抛错（原 catch 静默吞掉 → 字被标掌握但永远不进复习队列）；`recordReview` 的 progress 更新失败返 `success: false`（原 `success: true` 是静默失败 → Leitner Box 不降级）。

**老字段退役（B7/B8）**：`getNextChar` / `getAchievements` 改用 `learning_progress` 查"已掌握"（V2.3 同源修复在 getStats/getMasteredChars 已做，这两个 action 漏改）→ 新学字 `mastered_chars=[]` 不再被当新字、成就页不再基于假阳性。

**前端 UX（B9-B12）**：B9 learn.js `stepResults[3]` 越界写入（V2.5.1 删描红残留）→ `[2]`；B10 review.js 看字选义传 selOpt 给 classifyError + 删无效三元孤立破折号；B11 review.js `handleAsrFailure` 回滚 `asrProcessing/recording`；B12 index.js `loadIndexData` 加 `loading` 守卫防并发 setData 竞争。

**前端 P1（M1/M2/M4/M5/M6/M7/M8/M10/M11）**：
- M1 review.js 加 `onUnload` 清理 `recorderManager` + `recordTimeout`(录音切 tab 麦克风持续占用)
- M2 settings.js switch 拒订阅 3 处回滚(`pushSubscribed: false`)
- M4 mastered.js 加 `onShow` 重新拉数据
- M5 mastered.js 区分 `networkError` vs `empty` + `retryLoad`
- M6 learn.js `continueLearning` 改调 `resetLearnStateMachine()` + 抽 `resetLearnedBatch()` helper
- M7 learn.js `startRecord/stopRecord` 开头统一 `clearTimeout`(4.5s 超时句柄泄漏)
- M8 learn.js `checkMasteredChar` 补 batch reset(旧 batch 触发 mini-review 复习错字)
- M10 main/index.js `streak_count` 跳天重置(比对 `last_learn_date` 与今/昨)
- M11 spaced-repetition.js `updateBoxLevel` 防 `boxLevel=0/NaN`(`Math.max(1, Number(boxLevel) || 1)`)

**现场发现**：`去复习`按钮 `navigateTo` → `switchTab`(tabBar 页面 navigateTo 静默失败)、review.js `loadOptions` 静默改 toast、review.js `comboLevel` undefined 警告(getComboLevel 不返回 level 字段)、首页 `getOpenid` 8s 兜底超时(SDK 3.16.0 timeout 不触发 fail 回调,await 永远挂起) + `loadIndexData` 用 `_loadingFlag` + finally 保证可恢复。

## 开发约定

1. **ES5 语法**：对象回调用 `key: function(){}` 不用 `key(){}`，`var self = this` 模式，避免 `.bind()` 链式调用
2. **openid 识别用户**：微信云开发通过 openid 标识用户
3. **云函数统一入口**：main 云函数处理所有业务逻辑（**22 个 action**，V2.5.3），login 独立处理 openid 获取。详细分组见 [docs/CHANGELOG.md](./CHANGELOG.md#22-个-action-分组)
4. **奖励后端控制**：云函数返回奖励结果，前端展示
5. **数据去重**：成就解锁使用幂等检查
6. **集合命名**：成就记录集合名为 `achievement_log`（无s）
7. **跨比对一致性**：首页统计和列表页统计使用相同的 `learning_progress` 查询条件（V2.3 起统一源）
8. **切字必重置**：learn / review 等页面切字时**必须**调 `resetLearnStateMachine()`（或在 review 的 `showCurrentQuestion` 写完整重置 setData），避免上一个字的状态残留
9. **密钥不进代码**：微信 AppSecret、百度 API Key/Secret 等敏感配置**必须**用云函数环境变量（`process.env`），代码里 `if (!xxx) throw new Error` 兜底，缺变量直接 fail 不静默
10. **主包 2MB 红线**：微信小程序主包硬限制 2MB。新增目录/批量文件前，必须判断这东西是不是该进主包——云函数代码、脚本、文档、node_modules 都不进——如果确定不进，立刻同步更新 `project.config.json` 的 `packOptions.ignore`。写完代码后跑一次「上传」看预估包大小，不要等提测才发现超限。当前排除清单见 `project.config.json` 的 `packOptions.ignore`
11. **算法抽离需先确认功能长期保留**：抽算法移植是有成本的（写测试、维护、留 PoC 记录），若功能可能被砍，迁移工时直接归零。原则：算法独立性值得追求，但功能稳定性是前置条件。
12. **B1 云函数鉴权拦截（V2.5.2）**：`cloudfunctions/main/index.js` switch 入口强制 `wxContext.OPENID` 校验。优先级:**公共 action 白名单（`PUBLIC_ACTIONS = ['getOptions','getQuestionOptions','getAudio']`）→ devMode + `DEV_OPENIDS` 白名单 → 生产 openid 严格匹配**。新增用户操作类 action 时,默认需要 openid,必须能解释为什么不进 `PUBLIC_ACTIONS`。
13. **tabBar 页面跳转用 switchTab（V2.5.2 现场发现）**：`app.json` `tabBar.list` 里的页面（首页/学习/复习/我的）必须用 `wx.switchTab`,**用 `navigateTo` 会静默失败**(基础库 throw 但不打 console,按钮点了没反应)。复制粘贴跳转代码时先查目标页是否 tabBar。
14. **`wx.cloud.callFunction` success 回调三分支（V2.5.2）**:`success` 不区分业务成功/失败,只表示"网络+云函数返回了"。必须三分支:`res.result.success === true` 正常处理 / `res.result.success === false` toast + console.error / `fail` 网络异常 toast。漏 else 会让鉴权/业务失败静默,用户看到空白 UI 不知道为啥。

## 部署步骤

1. 微信开发者工具导入项目，目录选择 `E:\claude\PMRD\shizi`，appid: `wxa2bbfca6b9ef6ebd`
2. 开通云开发环境（环境 ID：`cloud1-d7geippqn581097e3`）
3. **配置云函数环境变量**（V2.3 起必需，V2.5.2 加 1 项）：
   - 微信云开发控制台 → 云函数 → `main` → 配置 → 环境变量
   - 添加 5 个：`WX_APPID` / `WX_APPSECRET` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY` / `DEV_OPENIDS`
   - WX_APPID 用 `wxa2bbfca6b9ef6ebd`（公开）
   - 其余 4 个从对应平台后台拿，**绝对不能用代码里那串老密钥**（git 历史已泄露，视为废）
   - `DEV_OPENIDS`：**dev tools 调试专用白名单**(逗号分隔 openid 列表,**生产环境必须留空** = 完全禁止 devMode);客户端 dev tools 模式下自动注入 `devMode: true`,B1 鉴权走白名单分支绕过 wxContext 校验。获取 openid:DevTools Console 跑 `console.log(app.globalData.openid)`
4. 上传云函数：右键 `cloudfunctions/main` →「上传并部署：云端安装依赖」
5. 预览测试

## ⚠️ 安全注意事项

- **密钥硬编码事故（V2.3 之前）**：老代码 `cloudfunctions/main/index.js` 行 9-14 把 `WX_APPSECRET` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY` 写在 `const` 里，且已 push 到 origin 公开分支 `feature/v2.1-asr-fallback`。
- **已做止血**：V2.3 起改用 `process.env`，启动时校验。
- **仍需用户做**：去微信公众平台/百度智能云后台**重置对应密钥**，并在云开发控制台配新值。老密钥视为已泄露。
- **未来部署前**：若看到 `if (!process.env.XXX) throw` 风格的代码，新部署必须先配环境变量，否则会启动失败。
- **V2.5.2 新增 B1 鉴权拦截**：22 个 action 中 19 个用户 action 入口强制 `wxContext.OPENID` 校验,防横向越权(PUBLIC_ACTIONS 3 个无 openid 跳过鉴权)。**生产路径不接受任何 `data.openid` 伪造**(会被直接拒)。dev tools 调试走 `DEV_OPENIDS` 环境变量白名单 + 前端自动注入 `devMode: true`,**生产环境必须清空 `DEV_OPENIDS`**,否则任何持有合法 dev 工具账号的人都能绕过鉴权。

## 🔧 云数据库索引（性能必需）

**V2.3 P1 项**：随着用户量增长，下面的索引必需提前建好（在小用户量下也能提速）。**微信云开发不支持在代码里 createIndex**，必须**在云开发控制台手动建**。

### 1. 控制台入口

云开发控制台 → 数据库 → 选集合 → 索引管理 → 添加索引

### 2. 需要建的索引

#### 集合 `learning_progress`（最关键，影响所有复习链路）

| 索引字段(组合) | 索引类型 | 用途 |
|----------------|----------|------|
| `{openid: 1, next_review_date: 1}` | 升序 | `getPendingReview` 按 openid 过滤 + 按 next_review_date 排序 |
| `{openid: 1, status: 1}` | 升序 | `getStats`/`getMasteredChars` 按 openid+status 查"已掌握" |
| `{openid: 1, char_id: 1}` | **唯一** | `recordLearn` / `recordReview` / `getLearnChar` 按 openid+char_id 查/upsert（必须唯一，避免重复记录） |
| `{openid: 1, first_learn_date: 1}` | 升序 | `getDailyStats` 查"今日新学" |

#### 集合 `review_logs`（影响 R-16 数据清洗和复习历史查询）

| 索引字段(组合) | 索引类型 | 用途 |
|----------------|----------|------|
| `{openid: 1, reviewed_at: -1}` | 降序 | 个人复习历史时间序 |
| `{data_quality: 1, reviewed_at: 1}` | 升序 | `cleanReviewLogs` 找未清洗的旧记录 |

#### 集合 `users`（影响所有 action）

| 索引字段(组合) | 索引类型 | 用途 |
|----------------|----------|------|
| `{openid: 1}` | **唯一** | 所有 action 的入口过滤（必须唯一） |
| `{push_subscribed: 1}` | 升序 | `sendReviewReminder` 找订阅用户 |

#### 集合 `achievement_log` / `reward_logs`

| 索引字段(组合) | 索引类型 | 用途 |
|----------------|----------|------|
| `{openid: 1}` | 升序 | 个人成就/奖励查询 |

### 3. 建索引步骤(以 `learning_progress` 为例)

1. 控制台 → 数据库 → 选 `learning_progress` 集合
2. 顶部标签 → "**索引管理**"
3. 点 "**添加索引**"
4. 填:
   - 索引名:`openid_next_review_date_idx`
   - 字段:`openid`(升序),`next_review_date`(升序)
   - 是否唯一:**否**
5. 确定 → 等待几秒建好
6. 重复上述步骤建其他索引

### 4. 验证索引生效

云函数里加 `.explain()` 调(临时调试用):
```js
const explainRes = await db.collection('learning_progress')
  .where({ openid, status: _.in(['familiar', 'mastered', 'solid']) })
  .explain();
console.log(JSON.stringify(explainRes));  // 看是否命中索引
```

**说明**：用户量小(<1000)时没索引也能跑,但有索引更稳。**建议尽快建**。

## 登录流程

1. 用户打开小程序 → 显示登录卡片（tabbar隐藏）
2. 用户勾选隐私协议 → 显示头像选择器和昵称输入框
3. 点击头像按钮 → 微信弹出头像选择器（`open-type="chooseAvatar"`）
4. 昵称输入框（`type="nickname"`）支持微信自动填充
5. 点击「微信一键登录」→ `wx.login()` 获取 code
6. 上传头像到云存储（`wx.cloud.uploadFile`）
7. 调用 `main/wxLogin` 云函数完成登录
8. 云函数通过 `code2openid` 获取 openid，生成 token（7天有效期）
9. 用户信息（nickname, avatar_url）存入 `users` 集合
10. 首页和个人中心显示真实昵称和头像
