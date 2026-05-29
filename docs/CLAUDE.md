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
│   ├── 儿童识字应用_PRD_V1.1.0.md      # 产品需求文档
│   ├── 一级字表_拼音.xlsx              # 2256字原始数据
│   └── CLAUDE.md                      # 本文件（项目约定）
├── pages/                             # 页面目录
│   ├── index/                         # 首页
│   ├── learn/                         # 学习页
│   ├── review/                        # 复习页
│   ├── profile/                       # 个人中心
│   ├── mastered/                      # 已掌握汉字列表
│   └── settings/                      # 设置页
├── utils/
│   └── delight.js                     # V2.0 愉悦体验引擎
├── cloudfunctions/                    # 云函数
│   ├── login/                         # 获取openid
│   ├── main/                          # 主业务逻辑（14个action）
│   ├── fixData/                       # 数据修复
│   └── import_chardata/               # 汉字数据导入
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
  "token_expire": "Date"
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

| action | 说明 | 参数 |
|--------|------|------|
| wxLogin | 微信登录（code换openid + 生成token） | { code, nickname, avatarUrl } |
| getUser | 获取用户信息 | { openid } |
| getStats | 获取用户统计（与getMasteredChars使用相同交叉比对逻辑） | { openid } |
| getNextChar | 获取下一个待学汉字 | { openid } |
| recordLearn | 记录学习完成（含奖励发放） | { openid, charId } |
| getPendingReview | 获取待复习列表 | { openid, limit } |
| getAchievements | 获取成就列表 | { openid } |
| getOptions | 获取听音选字选项 | { charId } |
| recordReview | 记录复习结果 | { openid, charId, reviewMode, isCorrect } |
| recognizeVoice | 百度语音识别 | { fileID, targetPinyin } |
| getAudio | 百度TTS发音 | { char, pinyin } |
| updateUserInfo | 更新用户信息（头像/昵称） | { openid, nickname, avatarUrl } |
| getPhoneNumber | 微信手机号解密 | { code } |
| getMasteredChars | 获取已掌握汉字列表（交叉比对characters表） | { openid } |

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

## 已修复Bug

### mastered_chars 计数不一致（首页与列表页数量不同）

**现象**：
- `getStats` 数数组 = 7，`getMasteredChars` 交叉比对 = 6（悬空ID）
- 后 `getStats` 改纯去重 → 首页变7、列表仍是6（不一致）
- 又现 `countUpBatch` 参数名 bug → 首页始终显示0

**最终修复方案（2026-05-28）**：
1. **云函数** `getStats` 改用与 `getMasteredChars` 完全一致的算法：去重 → 查 characters 表 `id`/`_id` 双向匹配 → 再去重 → 计数
2. **前端** `utils/delight.js:103` `countUpBatch` 参数名修复：`item.target` → `item.value || item.target`

### profile 头像 cloud:// 路径乱码

**修复**：profile.js 检测 `cloud://` → `wx.cloud.getTempFileURL()` 转临时 HTTPS 链接 → WXML 条件渲染

## 开发约定

1. **ES5 语法**：对象回调用 `key: function(){}` 不用 `key(){}`，`var self = this` 模式，避免 `.bind()` 链式调用
2. **openid 识别用户**：微信云开发通过 openid 标识用户
3. **云函数统一入口**：main 云函数处理所有业务逻辑（14个action），login 独立处理 openid 获取
4. **奖励后端控制**：云函数返回奖励结果，前端展示
5. **数据去重**：成就解锁使用幂等检查
6. **集合命名**：成就记录集合名为 `achievement_log`（无s）
7. **跨比对一致性**：首页统计和列表页统计使用相同的交叉比对逻辑

## 部署步骤

1. 微信开发者工具导入项目，目录选择 `E:\claude\PMRD\shizi`，appid: `wxa2bbfca6b9ef6ebd`
2. 开通云开发环境（环境ID: `cloud1-d7geippqn581097e3`）
3. 上传云函数：右键 `cloudfunctions/main` 目录 →「上传并部署：云端安装依赖」
4. 预览测试

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
