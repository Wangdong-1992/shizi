# 儿童识字应用 产品需求文档（PRD）

> ⚠️ **V2.5.1 已删除描红功能(Step3),本文档仅作历史参考**。当前产品需求请看 [儿童识字应用_PRD_V2.5.0.md](儿童识字应用_PRD_V2.5.0.md)。

版本号：V2.4.0

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
| V2.4.0 | 2026/06/06 | 王栋 | 描红字形贴合(系统楷体 + SVG path) + DTW评分 + 按年龄容差 + 首页UI重设计 + 文档同步 |
| V2.5 | 2026/06/09 | 王栋 | 描红评分重做:hanzi-writer 4-check 算法移植 `utils/stroke-grader.js`(替换 V2.4 DTW)+ 坐标系修正 + 0 第三方渲染依赖 |

---

## 一、概述

### 1.1 产品目标

面向幼儿园儿童（3-6岁）的汉字学习应用，核心目标教会2256个常用汉字。

**技术栈：**
- 微信小程序云开发（云函数 + 云数据库）
- 前端：原生 WXML/WXSS/JS（ES5兼容）
- 语音：百度语音识别 API（语音合成 + 语音识别）
- 云环境：cloud1-d7geippqn581097e3
- AppID：wxa2bbfca6b9ef6ebd

### 1.2 目标用户细分

V2.4 起按年龄分档容差（3-4 岁更宽松、5-6 岁更严），默认 5 岁档。

| 年龄段 | 容差档位 | 行为 |
|--------|---------|------|
| 3 岁 | 0.45 | 最宽松,允许较大偏离 |
| 4 岁 | 0.55 | 较宽松 |
| 5 岁 | 0.70 | 默认档(新用户未设置时使用) |
| 6 岁 | 0.85 | 最严,要求更精准 |

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

> **当前数量：23 个 action**（截至 V2.4 阶段 2）。所有业务逻辑统一在 `cloudfunctions/main/index.js` 的 switch 路由里，按"用户/学习/复习/统计/语音/运维"六类分。

| action | 说明 | 参数 |
|--------|------|------|
| **用户/认证** | | |
| `wxLogin` | 微信登录(code换openid + 生成token),新建用户带 `age: null` | { code, nickname, avatar } |
| `getUser` | 获取用户信息(返回 users 整条记录,含 age) | { openid } |
| `updateUserInfo` | 更新用户信息(头像/昵称/age),age 仅接受 3-6 整数 | { openid, nickname, avatar_url/avatarUrl, age } |
| `getPhoneNumber` | 微信手机号解密 | { code } |
| `subscribeReminder` | 订阅/取消复习提醒(R-15) | { openid, subscribed } |
| **学习核心** | | |
| `getNextChar` | 获取下一个待学汉字(新字路径) | { openid } |
| `getLearnChar` | 获取字详情+笔顺+学习进度 | { openid, charId } |
| `recordLearn` | 记录学习完成 + 奖励 + 同步创建 learning_progress(V2.3 修复) | { openid, charId, isAssisted } |
| **复习核心** | | |
| `getPendingReview` | 获取待复习列表(V2.2 优先级算法) | { openid, limit } |
| `getOptions` | 获取听音选字选项(兼容旧调用) | { charId, shapeSimilar } |
| `getQuestionOptions` | 获取指定题型选项(V2.3,5 种题型) | { charId, questionType } |
| `recordReview` | 记录复习结果(三写:review_logs + learning_progress + 状态机) | { openid, charId, reviewMode, isCorrect, isAssisted, asrScore, exerciseType, errorType } |
| **统计/成就** | | |
| `getStats` | 用户统计 + 成长等级 + 每日进度(V2.3 改用 learning_progress 查"已掌握") | { openid } |
| `getDailyStats` | 今日新字 + 待复习 + 配额判断 | { openid } |
| `getAchievements` | 成就列表 | { openid } |
| `getMasteredChars` | 已掌握汉字列表(V2.3 改用 learning_progress.status in [familiar,mastered,solid]) | { openid } |
| **语音/百度** | | |
| `recognizeVoice` | 百度语音识别(ASR) | { fileID, targetPinyin } |
| `getAudio` | 百度 TTS 发音 | { char, pinyin } |
| **运维** | | |
| `migrateProgress` | 旧数据按需迁移(mastered_chars → learning_progress familiar) | { openid } |
| `cleanReviewLogs` | R-16 清洗 V2.1 之前的假阳性 review_logs | { cutoffDate, dryRun, batchSize } |
| `sendReviewReminder` | 定时器触发,订阅用户推送复习提醒 | (定时器或手动) |
| `resetUserData` | V2.3 危险操作:清空当前用户所有学习数据 | { confirm: true, devMode?, openid? } |
| `getStrokeData` | V2.4 阶段 2:返回单字笔顺数据(points + direction + svgPath) | { char } |

---

## 三、云数据库集合

| 集合名 | 说明 |
|--------|------|
| users | 用户数据(openid识别) |
| characters | 汉字数据(2256字) |
| achievement_log | 成就记录(无s) |
| reward_logs | 奖励记录 |
| review_logs | 复习记录 |
| learning_progress | 学习进度(V2.2 引入,V2.3 起为已掌握/待复习的唯一源) |

**characters 集合结构：**
```json
{ "_id": "xxx", "id": 1, "char": "一", "pinyin": "yī" }
```

**users 集合结构(V2.4 当前)：**
```json
{
  "openid": "xxx",              // 唯一索引
  "nickname": "小明",
  "avatar_url": "",
  "star_count": 0,
  "flower_count": 0,
  "streak_count": 0,
  "mastered_chars": [],        // 已逐渐废弃(V2.3 改用 learning_progress)
  "last_learn_date": "",
  "token": "xxx",                // V1.4.0 引入,7 天有效期
  "token_expire": "Date",
  "age": null,                  // V2.4 宝宝年龄(3-6,null=未设置,前端 fallback 5 岁)
  "push_subscribed": false,     // R-15 复习提醒
  "push_last_sent_date": "",    // R-15 防重复推送
  "max_combo": 0,               // R-14 个人最佳连击
  "total_learn_days": 0,        // R-14 学习天数
  "created_at": "Date",
  "updated_at": "Date"
}
```

---

## 四、页面结构

### 4.1 首页 (pages/index) - V2.4 卡片化重设计

- **顶部 header**:白底圆角卡片,大头像(96rpx 圆形渐变)+ 昵称(36rpx)+ 问候语 + 成长等级进度条
- **统计卡片**:已掌握字数、星星数、小红花数(三栏,带 icon)
- **今日进度卡片**:今日新学 N/M + 个人最佳(最高连击 + 学习天数)
- **今日待复习入口**:V2.2 复习入口,有 N 个待复习时显示
- **分享成就按钮**:V2.4 新增,生成 Canvas 分享卡
- **操作区**:开始学习区 - "去学习"(剩余 N 字) / "去复习"(待复习 N 字)
- **成就区**:3 列 grid 展示成就徽章,已解锁的脉冲呼吸

**间距规范(V2.4 统一):** 所有 section/card 纵向间距统一为 **24rpx**(贴合 8px 网格)。

### 4.2 学习页 (pages/learn) - V2.2 四步递进状态机

**流程：** Step1 释义 → Step2 再认 → Step3 描红 → Step4 跟读

**四步详细：**

| 步骤 | 内容 | 通过条件 | UI |
|------|------|---------|-----|
| Step1 释义 | 展示汉字 + 拼音 + 释义 | 点击"我记住了" | 大字卡片 + 拼音小字 + 释义 |
| Step2 再认 | 听音/看字选正确项 | 选对一项 | 4 选项 grid,正确高亮 |
| Step3 描红 | Canvas 描字 + DTW 评分 | DTW 分数 ≥ 5 岁档默认 0.70 | 虚线引导 + 偏离时红线警告 |
| Step4 跟读 | 按住录音 + 百度 ASR | 拼音匹配 ≥ 0.7 | 录音按钮 + 波形动画 |

**Step3 描红详细(V2.4 升级)：**
- 底字渲染:先用本地 medians 同步显示 → 异步拉云函数 strokeCache 升级为 SVG path(精确贴合 Arphic 楷体)
- 实时反馈:偏离引导线 → 振动 + 引导线变红(warn 阈值按年龄 3岁50/4岁45/5岁35/6岁30)
- 完成判定:DTW 评分 ≥ 容差阈值(pass 阈值按年龄 3岁0.45/4岁0.55/5岁0.70/6岁0.85)
- 坐标系:固定 200×200 逻辑坐标(dpr 自适应),SVG path 数据层预翻转 (x, y) → (200-x, 200-y) 补偿 WeChat canvas 镜像

**最终判定(V2.2 起)：** Step2 或 Step4 任一正确即算学会(描红不参与最终判定,只作为练习环节)。

### 4.3 复习页 (pages/review) - V2.2 适配

- 听音选字模式:小喇叭按钮居中,4 个汉字选项
- 看字说音模式:大字展示汉字(不显示拼音),按住录音
- 复习调度:V2.2 间隔重复(Leitner Box 5 级),优先级算法
- Box 升降反馈:答对升盒、答错降盒,带 box 数字显示
- ASR 降级:ASR 失败或低分 → 转选择题(避免假阳性)

### 4.4 个人中心 (pages/profile)

- 头像卡片:右上角设置按钮(返回首页)
- 学习统计:已掌握、星星、小红花、连续天数
- 成就展示:grid 布局,显示已解锁/未解锁
- 头像 cloud:// 路径处理:检测 → `wx.cloud.getTempFileURL()` 转临时 HTTPS 链接(V2.3 修复)

### 4.5 已掌握列表页 (pages/mastered)

- 入口:首页统计卡片点击"已掌握"区域
- 布局:4 列 grid,大字 + 灰色拼音
- 交互:点击进入学习页二次学习;空状态友好提示

### 4.6 设置页 (pages/settings) - V2.4 加宝宝年龄

**功能列表(从上到下):**

| 项 | 交互 | 备注 |
|---|------|------|
| 修改头像 | ActionSheet 二选一(相册/微信) | 上传到云存储,存 fileID |
| 修改昵称 | ActionSheet 二选一(微信昵称/自定义) | 1-10 字 |
| **宝宝年龄(V2.4)** | **picker 弹窗 3/4/5/6 岁** | **影响描红容差,默认 5 岁** |
| 复习提醒 | Switch + 订阅消息授权 | R-15 |
| 关于我们 | showModal | 显示版本号 |
| 退出登录 | showModal 二次确认 | 清 openid/userInfo/userAge |
| 清除学习数据 | showModal 二次确认(危险) | 调云函数 resetUserData |

**宝宝年龄弹窗(V2.4 新增):**
- 触发:点击"宝宝年龄"行
- 控件:底部 sheet 弹窗 + picker mode="selector" 单列选择
- 选项:3岁 / 4岁 / 5岁 / 6岁
- 提交:调 updateUserInfo 传 age → 同步 app.globalData.userAge
- 提示文案:"影响描红容差,3-4岁更宽松、5-6岁更严"

---

## 五、设计规范

| 元素 | 规范 |
|------|------|
| 主色调 | 蓝色 #4A90D9 + 橙色 #FF9F43 |
| 背景色 | 浅色渐变 #E8F4FD → #FDF6EC |
| 按钮圆角 | 16px |
| 卡片圆角 | 32px(首页)/ 20px(学习页) |
| 阴影 | #0000001A,模糊 8px |
| 间距 | 基于 8px 网格(8/16/24/32) - V2.4 卡片间距统一 24rpx |
| 字体 | 楷体(描红底字 Kaiti / STKaiti / 楷体 fallback) |

---

## 六、动画效果

V2.0.0 引入 `utils/delight.js` 引擎,提供 14 组关键帧动画,详见 docs/CLAUDE.md "页面动画清单"。

**V2.0 14 组关键帧：**

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

---

## 七、交互规则

### 7.1 录音按钮

- 按下 < 0.5秒:提示"按住时间太短",不提交录音
- 按下 >= 0.5秒:正常提交录音进行识别
- 录音超时:4.5 秒强制停止

### 7.2 异常处理

| 场景 | 处理 |
|------|------|
| 网络异常 | 显示重试按钮 |
| 语音识别失败 | 转选择题(V2.1 降级) |
| 无可学习汉字 | 显示"已学完所有汉字" |
| 复习内容为空 | 显示"今日复习已完成" |
| 描红数据加载失败 | 3 秒后跳过描红,直接进入 Step4 |
| 用户 token 过期 | 跳登录页重登 |

### 7.3 状态机残留处理(V2.3 修复)

**切字前必须调 `resetLearnStateMachine()`** 重置 25+ 字段,避免上一个字的状态(learnCompleted / currentStep / stepResults / dailyQuotaReached 等)残留到新字。

---

## 八、密钥管理(V2.3 P0 修复)

> ⚠️ **2026-06-01 重置作废**：原代码 `cloudfunctions/main/index.js` 第 9-14 行曾硬编码 `WX_APPSECRET` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY` 并推送到 GitHub 公开分支 `feature/v2.1-asr-fallback`,视为已泄露。

**V2.3 修复方案：**
- 密钥全部从代码中剥离,改用云函数环境变量(`process.env`)
- 启动时校验:`if (!process.env.XXX) throw new Error`
- **部署前必须**在云开发控制台 → 云函数 `main` → 配置 → 环境变量 配新值
- 4 个环境变量:`WX_APPID` / `WX_APPSECRET` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY`
- 老密钥(代码里的字符串)绝对不要再使用

---

## 九、模块/工具

### 9.1 utils/delight.js (V2.0)

愉悦体验引擎,API 详见 docs/CLAUDE.md "V2.0 愉悦体验引擎"。

### 9.2 utils/spaced-repetition.js (V2.2)

Leitner Box 间隔重复算法 (1-5 级),五级掌握状态机(new → seeing → familiar → mastered → solid),优先级调度。

### 9.3 utils/audio.js (V2.3)

TTS 拉取 + 自动重试。百度 TTS 直链带一次性 `access_token`,云函数内部 token 偶尔失效,`audio.js` 抽象统一处理,失败时自动重试一次。

### 9.4 utils/stroke-grader.js (V2.5,替换 V2.4 stroke-dtw.js)

hanzi-writer 4-check 描红评分(纯函数模块)。算法移植自 hanzi-writer 3.7.3:
- **startAndEndMatches** — 笔画首末点距离 ≤ 48.8px(200×200 缩放下)
- **directionMatches** — 边缘向量 vs 笔画向量余弦相似度均值 > 0
- **lengthMatches** — `leniency*(len+25)/(strokeLen+25) ≥ 0.35`
- **shapeFit** — 归一化曲线 + 5 个旋转角度,Fréchet 距离 ≤ 0.4*leniency

**坐标系修正(V2.5 关键 bug 修复)**:V2.4 DTW 把 CSS 像素与 200×200 逻辑混着跑;V2.5 `touchend` 中 `userLogical = p / (scaleX|scaleY)`,统一坐标系。

**年龄 → leniency**:3岁 2.0 / 4岁 1.5 / 5岁 1.2 / 6岁 1.0。

**单元测试**:`node scripts/test-stroke-grader.js` 跑 47 项(基础工具 / Stroke 类 / 4 个判定 / 端到端 / leniency 调整),全部通过。

**V2.5 不再包含**:`utils/stroke-dtw.js` + `scripts/test-stroke-dtw.js` 已删除;`hanzi-writer` npm 依赖已移除。

### 9.5 utils/progressive-hint.js / utils/error-classifier.js (V2.3)

学习页渐进提示 + 错因分类(形近字/音近字/笔画错误等)。

---

## 十、V2.4 描红字形贴合架构

**问题(V2.3 及之前)：** 描红底字用系统 `sans-serif` 字体,跟 stroke-data 用的 Arphic 楷体(Make Me a Hanzi)字形不一致 → 底字和虚线引导对不上,儿童描红时方向/位置偏差明显。

**V2.4 阶段 1(已上线)：** 切换到系统楷体 `'140px "Kaiti", "STKaiti", "楷体", serif'`,改善但各家略有差异,无法 100% 贴合。

**V2.4 阶段 2(已上线)：** 用 SVG path 渲染底字
- 数据：2256 个 JSON 拆到 `cloudfunctions/main/strokeCache/<字>.json`(每字 1-3KB,含 svgPath)
- 主包 `utils/stroke-data.js` 保持 1.6MB(无 svgPath)以装下 2MB 限制
- `pages/learn/learn.js` 加 `loadStrokeData(char)` 和 `preloadStrokeData(chars)` 异步函数
- `initStep3` 流程:先用本地 medians 显示(无白屏)→ 异步拉云函数 strokeCache 升级 strokePaths → 失败 fallback 同步数据

**Canvas 坐标系修复：**
- 微信 `400rpx` CSS 尺寸在不同设备上 ≠ `200px`(dpr 变化)
- 改为固定 200×200 逻辑坐标系,所有渲染坐标基于 200×200

**SVG Path 坐标翻转：**
- WeChat `canvas.createPath2D()` 渲染时 SVG path 显示为镜像+倒置
- `normalizeSvgPath()` 在数据层预先翻转:`(x, y) → (200-x, 200-y)`

**笔顺纠正增强：**
- `classifyDirection()` 从 5 类扩展到 7 类(h/v/d/u/p/t),拆分捺(u)和点(p)
- `reorderToGB()` 贪心匹配算法:cnchar GB 标准 × hw 笔画方向/类型/折数/空间位置
- `fixStrokeOrder()` 垂直栈检测作为回退,共计纠正 ~1293 字

**V2.4 阶段 2 Day 4：DTW 评分 + 按年龄容差**
- 详见 § 1.2 和 § 9.4

---

## 十一、部署步骤

1. 微信开发者工具导入项目,目录选择 `E:\claude\PMRD\shizi`,AppID: `wxa2bbfca6b9ef6ebd`
2. 开通云开发环境(环境 ID:`cloud1-d7geippqn581097e3`)
3. **配置云函数环境变量(V2.3 起必需):**
   - 云开发控制台 → 云函数 → `main` → 配置 → 环境变量
   - 添加 4 个:`WX_APPID` / `WX_APPSECRET` / `BAIDU_API_KEY` / `BAIDU_SECRET_KEY`
4. **建云数据库索引(V2.3 P1):** 详见 `docs/云数据库索引_runbook.md`(8 个索引,控制台手动建)
5. 上传云函数:右键 `cloudfunctions/main` →「上传并部署:云端安装依赖」
6. 预览测试

---

## 十二、已修复 Bug 索引

| 修复版本 | Bug | 现象 |
|---------|-----|------|
| V1.5.1 | 登录授权 | getUserInfo 弃用 → chooseAvatar + nickname |
| V2.3 | mastered_chars 计数不一致 | 首页与列表页数量不同(改用 learning_progress) |
| V2.3 | profile 头像 cloud:// 路径乱码 | 转 TempFileURL |
| V2.3 | tabBar 页面二次进入 fromMasteredChar 不消费 | learn 是 tabBar,二次进入只触发 onShow |
| V2.3 | 切字时四步状态机残留 | 学完一个字再学下一个直接显示"学会了" |
| V2.3 | dailyQuotaReached 残留 | 配额提示卡在新字 |
| V2.3 | getStats 走降级路径返回老数据 | .count() 抛异常触发降级 |
| V2.3 | 密钥硬编码 | 老代码 git 历史泄露 |

---

## 十三、版本记录

| 版本 | 时间 | 修订人 | 备注 |
|------|------|--------|------|
| V1.0.0 | 2026/05/14 | 王栋 | 创建 V1.0.0 版本 |
| V1.1.0 | 2026/05/21 | 王栋 | 语音识别接入;UI优化;PRD整理 |
| V1.2.0 | 2026/05/21 | 王栋 | 新增已掌握汉字列表 |
| V1.3.0 | 2026/05/26 | 王栋 | 新增设置页 |
| V1.4.0 | 2026/05/27 | 王栋 | 微信昵称头像授权登录 |
| V1.5.0 | 2026/05/27 | 王栋 | 严选风格登录页改造 |
| V1.5.1 | 2026/05/27 | 王栋 | 登录授权修复 |
| V1.6.0 | 2026/05/28 | 王栋 | 手机号授权+设置页修改 |
| V2.0.0 | 2026/05/28 | 王栋 | 愉悦体验全面升级 |
| V2.1 | 2026/05/29 | 王栋 | ASR降级选择题 + Math.random()假阳性消除 |
| V2.2 | 2026/05/29 | 王栋 | 间隔重复引擎 + 四步递进学习 + 笔顺描红 |
| V2.3 | 2026/06/01 | 王栋 | P0 修复 + resetUserData + 体验修补 |
| V2.4.0 | 2026/06/06 | 王栋 | 描红字形贴合 + DTW 评分 + 按年龄容差 + 首页 UI 重设计 |
