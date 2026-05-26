# 儿童识字应用 产品需求文档（PRD）

版本号：V1.1.0

| 版本 | 时间 | 修订人 | 备注 |
|------|------|--------|------|
| V1.0.0 | 2026/05/14 | 王栋 | 创建 V1.0.0 版本 |
| V1.1.0 | 2026/05/21 | 王栋 | 修复评审反馈；增加语音识别；优化UI |
| V1.2.0 | 2026/05/21 | 王栋 | 新增已掌握汉字列表功能 |

---

## 一、概述

### 1.1 产品目标

面向幼儿园儿童（3-6岁）的汉字学习应用，核心目标教会2256个常用汉字。

**技术栈：**
- 微信小程序云开发（云函数 + 云数据库）
- 前端：原生 WXML/WXSS/JS
- 语音：百度语音识别 API（语音合成 + 语音识别）
- 云环境：cloud1-d7geippqn581097e3

### 1.2 奖励机制

| 场景 | 奖励 |
|------|------|
| 单字学习完成（3次跟读正确） | 星星x1 |
| 连续学习10字 | 星星x3 |
| 连续学习50字 | 小红花x1 |
| 复习全对 | 小红花x1 |

### 1.3 成就系统

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

| action | 说明 | 参数 |
|--------|------|------|
| getUser | 获取用户信息 | { openid } |
| getStats | 获取用户统计 | { openid } |
| getNextChar | 获取下一个待学汉字 | { openid } |
| recordLearn | 记录学习完成 | { openid, charId } |
| getPendingReview | 获取待复习列表 | { openid, limit } |
| getAchievements | 获取成就列表 | { openid } |
| getOptions | 获取听音选字选项 | { charId } |
| recordReview | 记录复习结果 | { openid, charId, reviewMode, isCorrect } |
| recognizeVoice | 百度语音识别 | { fileID, targetPinyin } |
| getAudio | 百度TTS发音 | { char, pinyin } |
| getMasteredChars | 获取已掌握汉字列表 | { openid } |

---

## 三、云数据库集合

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
  "star_count": 0,
  "flower_count": 0,
  "streak_count": 0,
  "mastered_chars": [],
  "last_learn_date": ""
}
```

---

## 四、页面结构

### 4.1 首页 (pages/index)

- 顶部：头像 + 昵称
- 统计卡片：已掌握字数、星星数、小红花数
- 操作区：去学习、去复习入口
- 成就区：3列grid展示成就徽章

### 4.2 学习页 (pages/learn)

- 进度指示器：3个圆点，完成变绿
- 汉字卡片：大字居中 + 拼音
- 发音按钮：🔊 听发音（调用百度TTS）
- 跟读按钮：按住录音（百度语音识别）
- 逻辑：连续3次正确后调用 recordLearn

### 4.3 复习页 (pages/review)

**听音选字模式：**
- 小喇叭按钮居中（无文字）
- 4个汉字选项
- 点击选项后高亮对错

**看字说音模式：**
- 大字展示汉字（不显示拼音）
- 按住录音按钮 >= 0.5秒才提交识别
- 识别结果正确/错误反馈

### 4.4 个人中心 (pages/profile)

- 头像卡片：右上角设置按钮（返回首页）
- 学习统计：已掌握、星星、小红花、连续天数
- 成就展示：grid布局，显示已解锁/未解锁

### 4.5 已掌握列表页 (pages/mastered)

**入口：** 首页统计卡片点击"已掌握"区域

**布局：**
- 顶部导航栏：返回按钮 + 标题"已掌握汉字（N个）"
- 内容区：网格布局，每行4个汉字卡片
- 每个卡片：大字显示汉字 + 拼音（灰色小字）

**交互：**
- 点击某个已掌握汉字 → 跳转学习页，显示该字
- 用户跟读3次正确 → 完成复习，返回列表页
- 空状态：显示"还没有掌握汉字哦，快去学习吧 →"

**页面文件：**
- `pages/mastered/mastered.js` - 列表逻辑
- `pages/mastered/mastered.wxml` - 列表结构
- `pages/mastered/mastered.wxss` - 列表样式
- `pages/mastered/mastered.json` - 页面配置

---

## 五、设计规范

| 元素 | 规范 |
|------|------|
| 主色调 | 蓝色 #4A90D9 + 橙色 #FF9F43 |
| 背景色 | 浅色渐变 #E8F4FD → #FDF6EC |
| 按钮圆角 | 16px |
| 卡片圆角 | 32px（首页）/ 20px（学习页） |
| 阴影 | #0000001A，模糊8px |
| 间距 | 基于8px网格（8/16/24/32） |

---

## 六、动画效果

| 动画 | 时长 | 说明 |
|------|------|------|
| 星星飘落 | 1.5s | 奖励获得 |
| 小红花绽放 | 1s | 奖励获得 |
| 绿光闪烁 | 0.3s | 跟读正确 |
| 卡片抖动 | 0.3s | 跟读错误 |
| 成就解锁 | 2s | 全屏徽章动画 |

---

## 七、交互规则

### 7.1 录音按钮

- 按下 < 0.5秒：提示"按住时间太短"，不提交录音
- 按下 >= 0.5秒：正常提交录音进行识别

### 7.2 异常处理

| 场景 | 处理 |
|------|------|
| 网络异常 | 显示重试按钮 |
| 语音识别失败 | 提示重新尝试 |
| 无可学习汉字 | 显示"已学完所有汉字" |
| 复习内容为空 | 显示"今日复习已完成" |

---

## 八、百度语音API配置

- AppID: 123394276
- API Key: 9Cwtp66NdN02jE5sALz7Q5rD
- Secret Key: yHh8xH9BICC0ZH4oOEGAdZEeXemviwN6

---

## 九、项目结构

```
E:/claude/shizi/
├── docs/                  # 产品文档
│   ├── 儿童识字应用_PRD_V1.1.0.md
│   ├── # 儿童识字应用 产品需求文档（PRD）.txt
│   ├── 一级字表_拼音.xlsx
│   └── CLAUDE.md
├── pages/
│   ├── index/              # 首页
│   ├── learn/              # 学习页
│   ├── review/             # 复习页
│   ├── profile/            # 个人中心
│   └── mastered/           # 已掌握列表页（新增）
├── cloudfunctions/
│   ├── login/              # 获取openid
│   └── main/               # 主业务逻辑
├── images/                 # TabBar图标
├── app.js                  # 应用入口
├── app.json                # 全局配置
├── app.wxss                # 全局样式
└── project.config.json     # 项目配置
```

---

## 十、部署步骤

1. 微信开发者工具导入项目，目录选择 `E:\claude\shizi`
2. 开通云开发环境（环境ID: `cloud1-d7geippqn581097e3`）
3. 上传云函数：
   ```bash
   npx tcb fn deploy login --dir cloudfunctions/login
   npx tcb fn deploy main --dir cloudfunctions/main
   ```
4. 预览测试

---

## 版本记录

| 版本 | 时间 | 修订人 | 备注 |
|------|------|--------|------|
| V1.0.0 | 2026/05/14 | 王栋 | 创建 V1.0.0 版本 |
| V1.1.0 | 2026/05/21 | 王栋 | 语音识别接入；UI优化；PRD整理 |