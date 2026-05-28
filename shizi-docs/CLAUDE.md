# 儿童识字应用 - 项目约定

## 项目概述

面向幼儿园儿童（3-6岁）的汉字学习应用，核心目标教会2256个常用汉字。

**技术栈：**
- 微信小程序云开发（云函数 + 云数据库）
- 前端：原生 WXML/WXSS/JS
- 语音：微信同声传译（简化版，发音为模拟实现）

## 项目结构

```
E:/claude/PMRD/shizi/
├── docs/                    # 产品文档目录
│   ├── 儿童识字应用_PRD_V1.1.0.md  # 产品需求文档
│   ├── # 儿童识字应用 产品需求文档（PRD）.txt
│   ├── 一级字表_拼音.xlsx       # 2256字原始数据
│   └── CLAUDE.md              # 本文档
├── pages/                    # 页面目录
│   ├── index/                # 首页
│   ├── learn/                # 学习页
│   ├── review/               # 复习页
│   ├── profile/              # 个人中心
│   ├── mastered/             # 已掌握汉字列表
│   └── settings/             # 设置页（V1.3.0）
├── cloudfunctions/           # 云函数
│   ├── login/                # 获取openid
│   ├── main/                 # 主业务逻辑（11个action）
│   ├── fixData/              # 数据修复
│   └── import_chardata/      # 汉字数据导入
├── images/                   # TabBar图标
├── app.js                    # 应用入口
├── app.json                  # 全局配置
└── app.wxss                  # 全局样式
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
{ "id": 1, "char": "一", "pinyin": "yī" }
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

| action | 说明 |
|--------|------|
| wxLogin | 微信登录（code换openid + 生成token） |
| getUser | 获取用户信息 |
| getStats | 获取用户统计 |
| getNextChar | 获取下一个待学汉字 |
| recordLearn | 记录学习完成（含奖励发放） |
| getPendingReview | 获取待复习列表 |
| getAchievements | 获取成就列表 |
| getOptions | 获取听音选字选项 |
| recordReview | 记录复习结果 |
| recognizeVoice | 百度语音识别 |
| getAudio | 百度TTS发音 |
| getMasteredChars | 获取已掌握汉字列表 |

## 已完成功能

- [x] 云函数部署（login, main）
- [x] 云数据库集合创建（users, characters, achievement_log, reward_logs, review_logs, learning_progress）
- [x] 汉字数据导入（2256字）
- [x] TabBar图标
- [x] 学习页汉字展示
- [x] 跳过按钮（已移除）
- [x] AI配图（已移除）
- [x] 成就奖励计算修复
- [x] 已掌握汉字列表页（mastered）
- [x] 设置页（settings）- 含关于我们、退出登录
- [x] 登录页UI改版（微信绿色按钮+隐私协议）
- [x] wxLogin云函数（token生成，7天有效期）
- [x] 严选风格登录页改造（V1.5.0）：全屏渐变背景+漂浮汉字+底部白色卡片+绑定 getUserInfo
- [x] 登录授权修复（V1.5.1）：废弃 getUserInfo → chooseAvatar + nickname input + 头像云存储上传
- [x] 手机号授权登录 + 设置页头像昵称修改（V1.6.0）

## 待完成功能

- [x] 语音发音（百度TTS，已接入getAudio）
- [x] 跟读识别功能（百度ASR，已接入recognizeVoice）
- [x] 复习页完整功能（听音选字、看字说音）
- [x] 个人中心数据展示

## 待完成功能

- [ ] 语音发音（目前为模拟实现，显示拼音toast）
- [ ] 跟读识别功能
- [ ] 复习页完整功能
- [ ] 个人中心数据展示

## 已知Bug

### 已掌握汉字列表数量与首页显示不一致

**现象**：首页显示已掌握2个，列表只显示1个

**原因**：`mastered_chars` 数组中同一个字被存了两次（id和_id都存了），导致：
- `getStats` 返回的 `mastered_chars.length` 是2
- `getMasteredChars` 过滤后去重只剩1个

**根因**：
1. `characters` 集合中每条记录有 `id`（数字）和 `_id`（MongoDB字符串）两个字段
2. `recordLearn` 存入 `mastered_chars` 时，charId可能是数字id也可能是字符串_id
3. `getMasteredChars` 过滤时用了字符串比较，但去重逻辑有问题

**修复方向**：
1. `recordLearn` 入库前统一转字符串再检查是否已存在
2. `getMasteredChars` 去重时用 Set 按字符串 id 去重
3. 或清理数据库中 `mastered_chars` 的重复数据

**相关代码**：
- `cloudfunctions/main/index.js` - `recordLearn` case
- `cloudfunctions/main/index.js` - `getMasteredChars` case

## 部署步骤

1. 微信开发者工具导入项目，目录选择 `E:\claude\PMRD\shizi`，appid: `wxa2bbfca6b9ef6ebd`
2. 开通云开发环境（环境ID: `cloud1-d7geippqn581097e3`）
3. 上传云函数：
   ```bash
   cd /e/claude/PMRD/shizi
   npx tcb fn deploy login --dir cloudfunctions/login -e cloud1-d7geippqn581097e3
   npx tcb fn deploy main --dir cloudfunctions/main -e cloud1-d7geippqn581097e3
   ```
4. 预览测试

## 文档管理规范

**核心原则：文档双写机制**
- 主文档目录：`E:\claude\PMRD\shizi\docs\`
- 备份文档目录：`E:\claude\PMRD\shizi-docs\`
- **任何文档更新必须同时操作两个目录，保持完全一致**

**双写范围：**
- PRD文档（`.md` 和 `.txt`）
- 配置文件（`CLAUDE.md`）
- 数据文件（`.xlsx`）

**操作流程：**
1. 先在 `docs/` 更新文档
2. 同步复制到 `shizi-docs/` 目录
3. 两个目录的同名文件内容必须完全一致

**验证方式：**
更新后检查两个目录的文件修改时间是否一致

## 开发约定

1. **openid识别用户**：微信云开发通过openid标识用户
2. **云函数统一入口**：main云函数处理所有业务逻辑
3. **奖励后端控制**：云函数返回奖励结果，前端展示
4. **数据去重**：成就解锁使用幂等检查
5. **集合命名**：成就记录集合名为 `achievement_log`（无s），注意与其他集合区分