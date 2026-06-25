# 儿童识字应用 产品需求文档（PRD）

版本号：V2.5.0

| 版本 | 时间 | 修订人 | 备注 |
|------|------|--------|------|
| V1.0.0 | 2026/05/14 | 王栋 | 创建 V1.0.0 版本 |
| V1.1.0 | 2026/05/21 | 王栋 | 修复评审反馈；增加语音识别；优化UI |
| V1.2.0 | 2026/05/21 | 王栋 | 新增已掌握汉字列表功能 |
| V1.3.0 | 2026/05/26 | 王栋 | 新增设置页面：关于我们、退出登录 |
| V1.4.0 | 2026/05/27 | 王栋 | 登录流程改造：微信昵称和头像授权 |
| V1.5.0 | 2026/05/27 | 王栋 | 严选风格登录页：全屏渐变+漂浮汉字+底部卡片 |
| V1.5.1 | 2026/05/27 | 王栋 | 登录授权修复：废弃getUserInfo→chooseAvatar+nickname+云存储上传 |
| V1.6.0 | 2026/05/28 | 王栋 | 手机号授权登录+设置页头像昵称修改+默认头像 |
| V2.0.0 | 2026/05/28 | 王栋 | 愉悦体验全面升级：delight.js引擎+三页面动画+14组关键帧 |
| V2.1 | 2026/05/29 | 王栋 | ASR降级选择题 + Math.random()假阳性消除 |
| V2.2 | 2026/05/29 | 王栋 | 间隔重复引擎(Leitner Box) + 四步递进学习 + 笔顺描红(2256字) |
| V2.3 | 2026/06/01 | 王栋 | P0修复(密钥保护/recordLearn同步创建learning_progress/getStats一致性) + resetUserData + 体验修补 |
| V2.4.0 | 2026/06/06 | 王栋 | 描红字形贴合(SVG path) + 笔顺纠正增强 + 首页UI重设计 + 文档同步 |
| V2.5.0 | 2026/06/23 | 王栋 | 描红评分重做：hanzi-writer 4-check算法移植(stroke-grader.js)，坐标系修正，47项单测全过 |
| V2.5.1 | 2026/06/23 | 王栋 | 删除描红功能（Step3），保留Step1释义→Step2再认→Step4跟读三步流程 |
| V2.5.2 | 2026/06/25 | 王栋 | P0/P1 大批量 bug 修复（26 个）+ B1 云函数鉴权拦截 + dev tools 工具链 |

---

## 一、概述

### 1.1 产品目标

面向幼儿园儿童（3-6岁）的汉字学习应用，核心目标教会2256个常用汉字。

**技术栈：**
- 微信小程序云开发（云函数 + 云数据库）
- 前端：原生 WXML/WXSS/JS（ES5兼容语法）
- 语音：百度语音识别 API（语音合成 + 语音识别）
- 云环境：`cloud1-d7geippqn581097e3`
- AppID：`wxa2bbfca6b9ef6ebd`

### 1.2 目标用户细分与年龄容差

V2.4 起按年龄分档容差（3-4岁更宽松、5-6岁更严），默认5岁档。

| 年龄段 | leniency | 行为 |
|--------|----------|------|
| 3岁 | 2.0 | 最宽松，3岁手部精细动作弱 |
| 4岁 | 1.5 | 较宽松 |
| 5岁 | 1.2 | 默认档（新用户未设置时使用） |
| 6岁 | 1.0 | 最严 |

**leniency 用途**：V2.5 hanzi-writer 4-check 评分算法中的长度宽松系数（V2.5.1已删除描红功能，此字段仅作历史参考）。

### 1.3 奖励机制

| 场景 | 奖励 |
|------|------|
| 单字学习完成（3次跟读正确） | 星星x1 |
| 连续学习10字 | 星星x3 |
| 连续学习50字 | 小红花x1 |
| 复习全对 | 小红花x1 |

### 1.4 成就系统

| 成就ID | 名称 | 条件 | 奖励 |
|--------|------|------|------|
| ACH001 | 初次识字 | 1字 | 星星x3 |
| ACH002 | 小小学生 | 50字 | 星星x10 |
| ACH003 | 认字小达人 | 200字 | 小红花x2 |
| ACH004 | 认字小高手 | 500字 | 小红花x5 |
| ACH005 | 汉字小博士 | 1000字 | 小红花x10 |
| ACH006 | 汉字小状元 | 2000字 | 小红花x20 |
| ACH007 | 汉字小天才 | 3500字 | 小红花x50 |

---

## 二、云函数接口 (main)

> **当前数量：22个action**（V2.5.1起无描红）。所有业务逻辑统一在 `cloudfunctions/main/index.js` 的 switch 路由里，按"用户/学习/复习/统计/语音/运维"六类分。

| action | 说明 | 参数 |
|--------|------|------|
| **用户/认证** | | |
| `wxLogin` | 微信登录（code换openid + 生成token），新建用户带 `age: null` | { code, nickname, avatar } |
| `getUser` | 获取用户信息（返回 users 整条记录，含 age） | { openid } |
| `updateUserInfo` | 更新用户信息（头像/昵称/age），age 仅接受 3-6 整数 | { openid, nickname, avatar_url/avatarUrl, age } |
| `getPhoneNumber` | 微信手机号解密 | { code } |
| `subscribeReminder` | 订阅/取消复习提醒（R-15） | { openid, subscribed } |
| **学习核心** | | |
| `getNextChar` | 获取下一个待学汉字（新字路径） | { openid } |
| `getLearnChar` | 获取字详情+笔顺+学习进度 | { openid, charId } |
| `recordLearn` | 记录学习完成 + 奖励 + **同步创建 learning_progress**（V2.3 修复） | { openid, charId, isAssisted } |
| **复习核心** | | |
| `getPendingReview` | 获取待复习列表（V2.2 优先级算法） | { openid, limit } |
| `getOptions` | 获取听音选字选项（兼容旧调用） | { charId, shapeSimilar } |
| `getQuestionOptions` | 获取指定题型选项（V2.3，5种题型） | { charId, questionType } |
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

---

## 三、云数据库集合

| 集合名 | 说明 |
|--------|------|
| users | 用户数据（openid识别） |
| characters | 汉字数据（2256字） |
| achievement_log | 成就记录（无s） |
| reward_logs | 奖励记录 |
| review_logs | 复习记录 |
| learning_progress | 学习进度（V2.2引入，V2.3起为已掌握/待复习的唯一源） |

**characters 集合结构：**
```json
{ "_id": "xxx", "id": 1, "char": "一", "pinyin": "yī" }
```

**users 集合结构（V2.5 当前）：**
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
  "age": null,
  "push_subscribed": false,
  "push_last_sent_date": "",
  "max_combo": 0,
  "total_learn_days": 0,
  "created_at": "Date",
  "updated_at": "Date"
}
```

| 字段 | 说明 |
|------|------|
| `age` | 宝宝年龄（3-6整数，null=未设置，前端 fallback 5岁） |
| `push_subscribed` | R-15 复习提醒订阅开关 |
| `push_last_sent_date` | R-15 防重复推送 |
| `max_combo` | R-14 个人最佳连击 |
| `total_learn_days` | R-14 累计学习天数 |
| `mastered_chars` | 已逐渐废弃（V2.3改用 learning_progress） |

**learning_progress 集合结构（V2.2引入，V2.3核心）：**
```json
{
  "_id": "xxx",
  "openid": "xxx",
  "char_id": 1,
  "status": "familiar",
  "box_level": 3,
  "next_review_date": "2026-06-10",
  "first_learn_date": "2026-06-01",
  "last_review_date": "2026-06-08",
  "review_count": 5
}
```

| status 值 | 含义 |
|-----------|------|
| `new` | 新字，未学习 |
| `seeing` | 见过，还没掌握 |
| `familiar` | 熟悉，进入间隔复习队列（V2.3起计入"已掌握"） |
| `mastered` | 掌握（V2.3起计入"已掌握"） |
| `solid` | 牢固（V2.3起计入"已掌握"） |

---

## 四、页面结构

### 4.1 首页 (pages/index) - V2.4 卡片化重设计

- **顶部 header**：白底圆角卡片，大头像(96rpx圆形渐变) + 昵称(36rpx) + 问候语 + 成长等级进度条
- **统计卡片**：已掌握字数、星星数、小红花数（三栏，带icon）
- **今日进度卡片**：今日新学 N/M + 个人最佳（最高连击 + 学习天数）
- **今日待复习入口**：V2.2复习入口，有N个待复习时显示
- **分享成就按钮**：V2.4新增，生成Canvas分享卡
- **操作区**：开始学习区 - "去学习"（剩余N字）/ "去复习"（待复习N字）
- **成就区**：3列grid展示成就徽章，已解锁的脉冲呼吸

**间距规范**：所有 section/card 纵向间距统一为 **24rpx**（贴合8px网格）。

### 4.2 学习页 (pages/learn) - 三步递进状态机

**流程：** Step1 释义 → Step2 再认 → Step4 跟读

**三步详细：**

| 步骤 | 内容 | 通过条件 | UI |
|------|------|---------|-----|
| Step1 释义 | 展示汉字 + 拼音 + 释义 | 点击"我记住了" | 大字卡片 + 拼音小字 + 释义 |
| Step2 再认 | 听音/看字选正确项 | 选对一项 | 4选项grid，正确高亮 |
| Step4 跟读 | 按住录音 + 百度ASR | 拼音匹配 ≥ 0.7 | 录音按钮 + 波形动画 |

**最终判定：** Step2 或 Step4 任一正确即算学会。

### 4.3 复习页 (pages/review) - V2.2 适配

- 听音选字模式：小喇叭按钮居中，4个汉字选项
- 看字说音模式：大字展示汉字（不显示拼音），按住录音
- 复习调度：V2.2 间隔重复（Leitner Box 5级），优先级算法
- Box升降反馈：答对升盒、答错降盒，带box数字显示
- ASR降级：ASR失败或低分 → 转选择题（避免假阳性）

### 4.4 个人中心 (pages/profile)

- 头像卡片：右上角设置按钮（返回首页）
- 学习统计：已掌握、星星、小红花、连续天数
- 成就展示：grid布局，显示已解锁/未解锁
- 头像 cloud:// 路径处理：检测 → `wx.cloud.getTempFileURL()` 转临时HTTPS链接（V2.3修复）

### 4.5 已掌握列表页 (pages/mastered)

- 入口：首页统计卡片点击"已掌握"区域
- 布局：4列grid，大字 + 灰色拼音
- 交互：点击进入学习页二次学习；空状态友好提示

### 4.6 设置页 (pages/settings)

| 项 | 交互 | 备注 |
|---|------|------|
| 修改头像 | ActionSheet二选一（相册/微信） | 上传到云存储，存fileID |
| 修改昵称 | ActionSheet二选一（微信昵称/自定义） | 1-10字 |
| 复习提醒 | Switch + 订阅消息授权 | R-15 |
| 关于我们 | showModal | 显示版本号 |
| 退出登录 | showModal二次确认 | 清openid/userInfo/userAge |
| 清除学习数据 | showModal二次确认（危险） | 调云函数 resetUserData |

---

## 五、设计规范

| 元素 | 规范 |
|------|------|
| 主色调 | 蓝色 #4A90D9 + 橙色 #FF9F43 |
| 背景色 | 浅色渐变 #E8F4FD → #FDF6EC |
| 按钮圆角 | 16px |
| 卡片圆角 | 32px（首页）/ 20px（学习页） |
| 阴影 | #0000001A，模糊8px |
| 间距 | 基于8px网格（8/16/24/32） - 卡片间距统一24rpx |
| 字体 | 楷体（卡片汉字显示 Kaiti / STKaiti / 楷体 fallback） |

---

## 六、动画效果

`utils/delight.js` 引擎提供14组关键帧动画：

| 动画 | 用途 | 页面 |
|------|------|------|
| entranceSlideUp | 分区入场序列 | 首页 |
| badgePulse | 成就徽章脉冲 | 首页 |
| cardBounceIn | 汉字卡片弹性入场 | 学习页 |
| cardShake | 答错卡片抖动 | 学习页 |
| rippleExpand | 录音水波纹扩散 | 学习页 |
| recordPulse | 录音按钮脉冲 | 学习页 |
| starPop | 进度星星点亮 | 学习页 |
| starFloat | 星星粒子飘浮 | 学习页 |
| confettiFall | 烟花纸片飘落 | 学习页 |
| feedbackPopIn | 反馈卡片弹入 | 学习页 |
| comboPopIn | 连击徽章弹入 | 复习页 |
| superComboGlow | 超级连击发光 | 复习页 |
| correctPop | 复习选项正确弹跳 | 复习页 |
| wrongShake | 复习选项错误抖动 | 复习页 |

### delight.js API

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

---

## 七、交互规则

### 7.1 录音按钮

- 按下 < 0.5秒：提示"按住时间太短"，不提交录音
- 按下 >= 0.5秒：正常提交录音进行识别
- 录音超时：4.5秒强制停止

### 7.2 异常处理

| 场景 | 处理 |
|------|------|
| 网络异常 | 显示重试按钮 |
| 语音识别失败 | 转选择题（V2.1降级） |
| 无可学习汉字 | 显示"已学完所有汉字" |
| 复习内容为空 | 显示"今日复习已完成" |
| 用户token过期 | 跳登录页重登 |

### 7.3 状态机残留处理（V2.3）

**切字前必须调 `resetLearnStateMachine()`** 重置字段，避免上一个字的状态残留到新字。

**重置字段清单：**
- 三步状态机：`currentStep / stepCompleted / stepResults / learnCompleted / finalResult / feedbackShow`
- Step2再认：`step2Options / step2Answered / step2Correct / step2SelectedId`
- Step4跟读：`step4Correct / step4Answered / asrFailed / asrProcessing / showChoiceMode / choiceOptions`
- 渐进提示：`charErrorCount / showProgressiveHint / progressiveHintText / progressiveHintLevel`
- 每日配额：`dailyQuotaReached / dailyQuotaReason`

---

## 八、密钥管理（V2.3 P0）

> ⚠️ **2026-06-01重置作废**：原代码 `cloudfunctions/main/index.js` 第9-14行曾硬编码 `WX_APPSECRET` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY` 并推送到GitHub公开分支，视为已泄露。

**V2.3修复方案：**
- 密钥全部从代码中剥离，改用云函数环境变量（`process.env`）
- 启动时校验：`if (!process.env.XXX) throw new Error`
- **部署前必须**在云开发控制台 → 云函数 `main` → 配置 → 环境变量 配新值

**4个环境变量：** `WX_APPID` / `WX_APPSECRET` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY`

- `WX_APPID` = `wxa2bbfca6b9ef6ebd`（公开，未变更）
- 其余3个从对应平台后台拿，**绝对不能再用代码里那串老密钥**

---

## 九、核心模块/工具

### 9.1 utils/delight.js（V2.0）

愉悦体验引擎。见§六。

### 9.2 utils/spaced-repetition.js（V2.2）

Leitner Box 间隔重复算法（1-5级），五级掌握状态机（new → seeing → familiar → mastered → solid），优先级调度。

### 9.3 utils/audio.js（V2.3）

TTS拉取 + 自动重试。百度TTS直链带一次性 `access_token`，token偶发失效时自动重试一次，第二次失败才走fallback（显示拼音文字）。

| API | 说明 |
|-----|------|
| `fetchTTS(char, pinyin, retryLeft, onSuccess, onFail)` | 拉音频URL，失败按retryLeft递归重试 |
| `playTTS(char, pinyin, onFallback)` | 便捷方法：拉URL → 播放 → 失败走onFallback |

### 9.4 utils/progressive-hint.js / utils/error-classifier.js（V2.3）

学习页渐进提示 + 错因分类（形近字/音近字/笔画错误等）。

---

## 十、间隔重复引擎（V2.2）

### Leitner Box 系统

5个等级，对应5种复习频率：

| 等级 | 状态 | 复习间隔 |
|------|------|---------|
| Box 1 | new（全新） | 当天 |
| Box 2 | seeing（见过） | 次日 |
| Box 3 | familiar（熟悉） | 3天 |
| Box 4 | mastered（掌握） | 7天 |
| Box 5 | solid（牢固） | 14天 |

### 升降规则

- 答对：Box + 1（最高5）
- 答错：Box - 1（最低1）

### 优先级调度

`getPendingReview` 按以下优先级返回待复习字：
1. 过期天数最多的（next_review_date 最早）
2. Box等级最低的（1级优先于5级）

---

## 十一、登录流程

1. 用户打开小程序 → 显示登录卡片（tabbar隐藏）
2. 用户勾选隐私协议 → 显示头像选择器和昵称输入框
3. 点击头像按钮 → 微信弹出头像选择器（`open-type="chooseAvatar"`）
4. 昵称输入框（`type="nickname"`）支持微信自动填充
5. 点击「微信一键登录」→ `wx.login()` 获取code
6. 上传头像到云存储（`wx.cloud.uploadFile`）
7. 调用 `main/wxLogin` 云函数完成登录
8. 云函数通过 `code2openid` 获取openid，生成token（7天有效期）
9. 用户信息（nickname, avatar_url）存入 `users` 集合
10. 首页和个人中心显示真实昵称和头像

---

## 十二、部署步骤

1. 微信开发者工具导入项目，目录选择 `E:\claude\PMRD\shizi`，appid: `wxa2bbfca6b9ef6ebd`
2. 开通云开发环境（环境ID：`cloud1-d7geippqn581097e3`）
3. **配置云函数环境变量（V2.3起必需）：**
   - 云开发控制台 → 云函数 → `main` → 配置 → 环境变量
   - 添加4个：`WX_APPID` / `WX_APPSECRET` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY`
   - WX_APPID = `wxa2bbfca6b9ef6ebd`（公开）
   - 其余3个从对应平台后台拿新值，**绝对不能再用代码里的老密钥**
4. **建云数据库索引（V2.3 P1）：** 在云开发控制台手动建，详见 `docs/云数据库索引_runbook.md`（8个索引）
5. 上传云函数：右键 `cloudfunctions/main` →「上传并部署：云端安装依赖」
6. 预览测试

---

## 十三、云数据库索引（性能必需）

> ⚠️ 微信云开发不支持代码里 `createIndex`，**必须在云开发控制台手动建**。

### 需要建的索引

#### learning_progress（最关键，影响所有复习链路）

| 索引字段(组合) | 索引类型 | 用途 |
|----------------|----------|------|
| `{openid: 1, next_review_date: 1}` | 升序 | `getPendingReview` 按openid过滤 + 按next_review_date排序 |
| `{openid: 1, status: 1}` | 升序 | `getStats`/`getMasteredChars` 按openid+status查"已掌握" |
| `{openid: 1, char_id: 1}` | **唯一** | `recordLearn`/`recordReview`/`getLearnChar` 按openid+char_id查/upsert |
| `{openid: 1, first_learn_date: 1}` | 升序 | `getDailyStats` 查"今日新学" |

#### review_logs（影响R-16数据清洗和复习历史查询）

| 索引字段(组合) | 索引类型 | 用途 |
|----------------|----------|------|
| `{openid: 1, reviewed_at: -1}` | 降序 | 个人复习历史时间序 |
| `{data_quality: 1, reviewed_at: 1}` | 升序 | `cleanReviewLogs` 找未清洗的旧记录 |

#### users（影响所有action）

| 索引字段(组合) | 索引类型 | 用途 |
|----------------|----------|------|
| `{openid: 1}` | **唯一** | 所有action的入口过滤 |
| `{push_subscribed: 1}` | 升序 | `sendReviewReminder` 找订阅用户 |

#### achievement_log / reward_logs

| 索引字段(组合) | 索引类型 | 用途 |
|----------------|----------|------|
| `{openid: 1}` | 升序 | 个人成就/奖励查询 |

### 建索引步骤

1. 云开发控制台 → 数据库 → 选集合 → 索引管理 → 添加索引
2. 填索引名（如 `openid_next_review_date_idx`）、字段、升序/降序、是否唯一
3. 确定，等待几秒建好
4. 重复直到8个索引全部建完

---

## 十四、已修复Bug索引

| 修复版本 | Bug | 现象 | 根因 |
|---------|-----|------|------|
| V1.5.1 | 登录授权 | getUserInfo弃用 | 微信API变更 |
| V2.3 | mastered_chars计数不一致 | 首页与列表页数量不同 | 改用 learning_progress 统一源 |
| V2.3 | profile头像cloud://路径乱码 | 头像不显示 | 需转TempFileURL |
| V2.3 | tabBar页面二次进入fromMasteredChar不消费 | 点字进learn始终显示"一" | tabBar二次进入只触发onShow不触发onLoad |
| V2.3 | 切字时四步状态机残留 | 学完一个字再学下一个直接显示"学会了" | checkMasteredChar没重置25+状态字段 |
| V2.3 | dailyQuotaReached残留 | 配额提示卡在新字 | 同上，未归到公共resetLearnStateMachine() |
| V2.3 | getStats走降级路径返回老数据 | 首页9 vs 列表页1 | .count()抛异常触发降级 |
| V2.3 | 密钥硬编码泄露 | git历史有明文密钥 | 剥离到云函数环境变量 |
| V2.5 | DTW坐标系bug | CSS像素vs 200×200逻辑混用，dpr变化时阈值失效 | V2.5统一到userLogical坐标修正 |
| **V2.5.2** | **B1 云函数无鉴权（横向越权）** | 任何用户拿到他人 openid 可读/写/删他人学习数据 | switch 入口强制 wxContext.OPENID 校验 + PUBLIC_ACTIONS 白名单 + devMode + DEV_OPENIDS 白名单 |
| V2.5.2 | B3 手机号明文日志 | 手机号泄露到云函数日志 | 前3+****+后4 脱敏 |
| V2.5.2 | B4 token 明文日志 | 7 天有效 token 泄露到日志 | 删 token 日志,只记 openid 末 6 位 |
| V2.5.2 | B5 recordLearn 静默失败 | 字被记"已掌握"但永远不进复习队列 | learning_progress 失败抛错,前端可感知 |
| V2.5.2 | B6 recordReview 静默失败 | review_logs 写入了但 Leitner Box 未降级 | progress 失败时返 success:false |
| V2.5.2 | B7 getNextChar 仍读 mastered_chars | 新学字 mastered_chars=[] 被当新字推出 | 改读 learning_progress |
| V2.5.2 | B8 getAchievements 仍读 mastered_chars | 成就页进度数字基于 V2.1 假阳性 | 改读 learning_progress（V2.3 漏改） |
| V2.5.2 | B9 stepResults[3] 越界写入 | submitLearnResult 永远读不到该结果,recordLearn 不调用,mastered 永远不增 | V2.5.1 删描红残留,改 `[2]` |
| V2.5.2 | B10 review 看字选义反馈卡破折号 + classifyError 空参 | "正确答案:天 — " 孤立破折号,错因永远 unknown | 删无效三元,传 selOpt 给 classifyError |
| V2.5.2 | B11 review ASR 转圈卡死 | WXML "正在识别..." 永远显示 | handleAsrFailure 加 asrProcessing:false |
| V2.5.2 | B12 首页 onShow 并发 setData 竞争 | 数字跳动/entranceReady 闪烁 | loadIndexData 加 loading 守卫 |
| V2.5.2 | M1 review 录音切 tab 麦克风持续占用 | recorderManager 是全局单例,onUnload 没解绑回调 | 加 onUnload 清理 |
| V2.5.2 | M2 settings switch 拒订阅不回滚 | switch 视觉开了但 pushSubscribed 没变 | 3 处回滚 setData({pushSubscribed: false}) |
| V2.5.2 | M4 mastered 缺 onShow | 从 review 回来新掌握的字符看不到 | 加 onShow 重新拉 |
| V2.5.2 | M5 mastered 网络失败伪装空状态 | 用户可能重学已会的字 | 区分 networkError vs empty + retryLoad |
| V2.5.2 | M6 continueLearning 手写 reset 漏字段 | 录音/ASR 状态残留到下一字 | 改调 resetLearnStateMachine() |
| V2.5.2 | M7 录音 4.5s timeout 句柄泄漏 | 旧 timeout 会强停新录音,识别音频被截断 | startRecord/stopRecord 开头统一 clearTimeout |
| V2.5.2 | M8 checkMasteredChar 漏 batch reset | 旧 batch 触发 mini-review 复习错字 | 抽 resetLearnedBatch() helper |
| V2.5.2 | M10 streak_count 跳天不重置 | 与 PRD"连续学习"定义不符 | 比对 last_learn_date 与今/昨 |
| V2.5.2 | M11 updateBoxLevel NaN 防御 | boxLevel=0 时 nextReviewDate 变 NaN,排序错乱 | Math.max(1, Number(boxLevel) \|\| 1) |
| V2.5.2 现场 | "去复习"按钮 navigateTo 静默失败 | review 是 tabBar 页面,navigateTo 不打 console 报错 | 改 wx.switchTab |
| V2.5.2 现场 | loadOptions success:false 静默 | 用户看到空白选项区不知为啥 | 加 else 分支 toast |
| V2.5.2 现场 | comboLevel undefined setData 警告 | getComboLevel 不返回 level 字段 | 改用 comboCount >= 10 直接判定 |
| V2.5.2 现场 | 首页 spinner 永远卡住 | getOpenid await 永远不返回(SDK 3.16.0 timeout 不触发 fail 回调) | 8s 兜底超时 + loadIndexData 用 _loadingFlag + finally |

---

## 十五、项目结构

```
E:/claude/PMRD/shizi/
├── docs/
│   ├── 儿童识字应用_PRD_V2.5.0.md    # 本文档
│   ├── 儿童识字应用_PRD_V2.0.0.md    # 历史上版本（归档）
│   ├── 云数据库索引_runbook.md       # 索引建池手册
│   └── CLAUDE.md                     # 项目约定（含V2.5完整工具说明）
├── pages/
│   ├── index/                        # 首页（V2.4卡片化重设计）
│   ├── learn/                        # 学习页（三步状态机：释义→再认→跟读）
│   ├── review/                       # 复习页（V2.2间隔重复适配）
│   ├── profile/                      # 个人中心
│   ├── mastered/                     # 已掌握汉字列表
│   └── settings/                    # 设置页
├── scripts/
│   └── smoke-test.js                # 冒烟测试
├── utils/
│   ├── delight.js                    # V2.0愉悦体验引擎
│   ├── spaced-repetition.js          # V2.2间隔重复算法
│   ├── audio.js                      # V2.3 TTS自动重试
│   ├── progressive-hint.js            # V2.3渐进提示
│   ├── error-classifier.js           # V2.3错因分类
│   └── question-types.js             # 题型支持
├── cloudfunctions/
│   ├── login/                        # 获取openid
│   ├── main/                         # 主业务逻辑（22个action，V2.5.1起无描红）
│   ├── fixData/                      # 数据修复
│   └── import_chardata/             # 汉字数据导入
├── images/                           # TabBar图标
├── app.js                            # 应用入口
├── app.json                          # 全局配置
├── app.wxss                          # 全局样式
└── project.config.json               # 项目配置（含packOptions.ignore）
```

---

## 十六、开发约定

1. **ES5语法**：对象回调用 `key: function(){}` 不用 `key(){}`，`var self = this` 模式
2. **openid识别用户**：微信云开发通过openid标识用户
3. **云函数统一入口**：main云函数处理所有业务逻辑（22个action），login独立处理openid获取
4. **奖励后端控制**：云函数返回奖励结果，前端展示
5. **数据去重**：成就解锁使用幂等检查
6. **集合命名**：成就记录集合名为 `achievement_log`（无s）
7. **跨比对一致性**：首页统计和列表页统计使用相同的 `learning_progress` 查询条件（V2.3起统一源）
8. **切字必重置**：learn/review等页面切字时**必须**调 `resetLearnStateMachine()`
9. **密钥不进代码**：敏感配置**必须**用云函数环境变量（`process.env`），代码里 `if (!xxx) throw new Error` 兜底
10. **主包2MB红线**：微信小程序主包硬限制2MB。云函数代码、脚本、文档、node_modules不进主包，排除清单见 `project.config.json` 的 `packOptions.ignore`
11. **算法抽离优先于库强集成**：在受限环境强集成第三方库失败后，改为抽取核心算法到独立模块（V2.5 hanzi-writer 8轮PoC失败的教训）

---

## 十七、已完成功能清单

- [x] 云函数部署（login, main）
- [x] 云数据库集合创建（users, characters, achievement_log, reward_logs, review_logs, learning_progress）
- [x] 汉字数据导入（2256字）
- [x] TabBar图标 + 首页/学习页/复习页/个人中心
- [x] 语音发音（百度TTS，getAudio）
- [x] 跟读识别（百度ASR，recognizeVoice）
- [x] 复习页完整功能（听音选字、看字说音）
- [x] 已掌握汉字列表页（mastered）
- [x] 设置页（settings）- 关于我们、退出登录、宝宝年龄
- [x] 成就奖励计算修复
- [x] 登录页UI改版（微信绿色按钮+隐私协议）
- [x] wxLogin云函数（token生成，7天有效期）
- [x] 微信昵称和头像授权登录（V1.4.0）
- [x] 严选风格登录页改造（V1.5.0）
- [x] 登录授权修复（V1.5.1）
- [x] 手机号授权登录 + 设置页头像昵称修改（V1.6.0）
- [x] 愉悦体验全面升级（V2.0.0）：delight.js + 三页面动画改造 + 14组关键帧
- [x] ASR降级选择题 + Math.random()假阳性消除（V2.1）
- [x] 间隔重复引擎（V2.2）：spaced-repetition.js + Leitner Box 5级 + 五级状态机 + 优先级调度
- [x] 四步递进学习页重构（V2.2）：释义→再认→描红→跟读，单页状态机【V2.5.1 已删除描红,改为三步流程】
- [x] 复习页适配（V2.2）：Box升降反馈 + 状态变迁提示 + exerciseType参数
- [x] 旧数据按需迁移（V2.2）：migrateProgress云函数
- [x] 云函数 recordReview 三写闭环：review_logs + learning_progress + 状态信息返回
- [x] **V2.3 P0**：密钥从代码剥离，改用云函数环境变量
- [x] **V2.3 P0**：recordLearn同步创建 learning_progress
- [x] **V2.3 P0**：getStats / getMasteredChars 改用 learning_progress 计算
- [x] **V2.3 P0**：客户端 getAudio 自动重试（utils/audio.js）
- [x] **V2.3**：resetUserData action（清空用户学习数据）
- [x] **V2.3**：settings页加"清除学习数据"按钮
- [x] **V2.3**：抽出 resetLearnStateMachine() 公共方法
