# ONBOARDING — 5 分钟入门

> 给新接手这个项目的工程师/agent。读完这份, 你应该能:
> - 知道项目是什么
> - 知道代码结构
> - 知道去哪里找什么文档
> - 知道跑哪些命令能验证一切正常

## 这是什么

**shizi** 是一个**儿童识字微信小程序**(3-6 岁), 教学 2256 个常用汉字, 用间隔重复算法帮助复习。

**当前版本**: V2.5.3 (2026-06-29)

**技术栈**:
- 前端: 微信小程序原生 (WXML / WXSS / JS, ES5 风格)
- 后端: 微信云函数 (Node 12+, 22 个 action 集中在一个 main 入口)
- 数据库: 微信云开发 NoSQL (6 个集合, 见 docs/CLAUDE.md "云数据库集合")
- 第三方: 百度语音 TTS / ASR (账号已在 .env.local 配)

## 5 分钟跑起来

### 1. 安装 + 验证

```bash
git clone <repo>
cd shizi
npm install          # 现在不会装任何东西(3 个 devDep 已删, 见 ADR P3-2)
npm test             # 62 项测试, 应全过
```

### 2. 微信开发者工具导入

- 项目目录: `E:\claude\PMRD\shizi` (或 clone 后的本地路径)
- AppID: `wxa2bbfca6b9ef6ebd`
- 后端服务: 选 "微信云开发"
- 云环境: `cloud1-d7geippqn581097e3`

### 3. 配置云函数环境变量

登录云开发控制台 → 云函数 → `main` → 配置 → 环境变量。需要 5 个:

| Key | Value 来源 | 备注 |
|---|---|---|
| `WX_APPID` | `wxa2bbfca6b9ef6ebd` | 公开值, 不变 |
| `WX_APPSECRET` | 微信公众平台 → 开发管理 | **新值**(老密钥已泄露) |
| `BAIDU_API_KEY` | 百度智能云 → 应用列表 | **新值** |
| `BAIDU_SECRET_KEY` | 百度智能云 → 应用列表 | **新值** |
| `DEV_OPENIDS` | 你的 openid (DevTools Console 跑 `console.log(app.globalData.openid)`) | dev tools 调试白名单; 生产环境**留空** |

### 4. 上传云函数

```
右键 cloudfunctions/main/ → "上传并部署:云端安装依赖"
```

### 5. 重启模拟器

DevTools 顶部刷新按钮 或 `Ctrl+R` / `Cmd+R`

### 6. 冒烟测试

DevTools Console 粘贴(粘贴后光标在 `>` 输入框):
```js
wx.cloud.callFunction({
  name: 'main',
  data: { action: 'getOptions', data: { charId: '1' } }
}).then(r => console.log('TEST:', JSON.stringify(r)))
```

预期输出 `success: true` + 4 个汉字选项(衣/忆/抑/一)。

更完整的冒烟测试见 `scripts/smoke-test-ui-v252.md`。

## 代码结构

```
E:\claude\PMRD\shizi\
├── app.js / app.json / app.wxss        # 小程序入口
├── pages/                              # 6 个页面
│   ├── index/                          # 首页
│   ├── learn/                          # 学习(三步)
│   ├── review/                         # 复习(五题型)
│   ├── profile/                        # 个人中心
│   ├── mastered/                       # 已掌握列表
│   └── settings/                       # 设置(含清除数据)
├── utils/                              # 前端工具
│   ├── spaced-repetition.js            # Leitner 算法(单一源)
│   ├── error-classifier.js             # 错因分类
│   ├── progressive-hint.js              # 渐进提示
│   ├── question-types.js                # 题型选择
│   ├── delight.js                       # 动画引擎
│   ├── audio.js                         # TTS 重试
│   └── logger.js                         # 日志脱敏 (P3-3)
├── cloudfunctions/
│   ├── login/                          # 微信登录 (独立云函数)
│   ├── main/                           # 22 个 action 主入口
│   │   ├── index.js                    # 入口 + 鉴权 (B1) + switch
│   │   ├── lib/spaced-repetition.js    # 单一源副本 (sync 同步)
│   │   ├── modules/
│   │   │   ├── format.js                # 日期/拼音 helper (P3-1)
│   │   │   ├── wechat.js                # 微信 API (P3-1)
│   │   │   ├── baidu.js                 # 百度 TTS/ASR + cache + 限流 (P3-1)
│   │   │   └── achievements.js         # 7 档成就配置 (P3-1)
│   │   └── package.json
│   ├── fixData/                        # 数据修复
│   └── import_chardata/                 # 字数据导入
├── docs/
│   ├── CLAUDE.md                       # AI agent 必读
│   ├── CHANGELOG.md                    # 版本变更
│   ├── system_design*.md               # 系统设计 (历史归档)
│   ├── ADR/                            # 架构决策记录
│   │   ├── 001-b1-auth.md
│   │   ├── 002-algorithm-source-of-truth.md
│   │   ├── 003-mastered-chars-deprecation.md
│   │   └── 004-tts-cache-and-rate-limit.md
│   ├── 儿童识字应用_PRD_V2.5.0.md     # 当前 PRD
│   └── ONBOARDING.md                   # 本文件
├── scripts/
│   ├── sync-utils-to-cloud.js          # 同步 utils → 云函数 lib/
│   ├── smoke-test-ui.md                # V2.3 UI 冒烟
│   └── smoke-test-ui-v252.md           # V2.5.2 UI 冒烟
└── package.json                        # npm test / sync-utils / sync-utils:check
```

## 找什么文档去哪

| 你想了解... | 看哪 |
|---|---|
| 22 个 action 是哪些,怎么鉴权 | [docs/CLAUDE.md](./CLAUDE.md) |
| 版本变更历史 | [docs/CHANGELOG.md](./CHANGELOG.md) |
| 某个架构决策的原因 | [docs/ADR/](./ADR/) |
| 当前 PRD (产品功能) | [docs/儿童识字应用_PRD_V2.5.0.md](./儿童识字应用_PRD_V2.5.0.md) |
| 算法逻辑 (Leitner Box) | [utils/spaced-repetition.js](../utils/spaced-repetition.js) + 23 项测试 |
| 云函数 22 个 action 实现 | [cloudfunctions/main/index.js](../cloudfunctions/main/index.js) |
| 老版本 (V2.1-2.4) 系统设计 | `docs/system_design*.md` (顶部 banner 标"历史参考") |
| UI 冒烟测试 | [scripts/smoke-test-ui-v252.md](../scripts/smoke-test-ui-v252.md) |

## 跑哪些命令

```bash
# 单元测试 (62 项, 核心算法 + 错因 + 渐进提示 + 题型选择)
npm test

# 同步算法真相源到云函数 (改 utils/spaced-repetition.js 后必跑)
npm run sync-utils

# CI 用: 检测 utils ↔ 云函数 lib/ 是否 drift
npm run sync-utils:check

# 部署云函数 (DevTools 右键 → 上传并部署:云端安装依赖)
# 部署前必跑 npm run sync-utils

# 本地冒烟测试
# 复制 scripts/smoke-test-ui-v252.md 的命令到 DevTools Console
```

## 关键技术决策(一句话)

1. **算法单一源**: `utils/spaced-repetition.js` 真相源, 云函数通过 sync 副本 (ADR-002)
2. **B1 鉴权**: 云函数入口强制 `wxContext.OPENID` 校验, PUBLIC_ACTIONS 3 个跳过 (ADR-001)
3. **TTS 防护**: 24h cache + IP 限流 (ADR-004)
4. **老字段退役**: `users.mastered_chars` 不再写入, 只读 fallback (ADR-003)
5. **V2.5.1**: 学习页三步流程(释义→再认→跟读), 描红功能彻底删除

## 常见问题

**Q: 我改了算法代码, 但云函数没生效?**
A: 你只改了 `utils/spaced-repetition.js`, 没跑 `npm run sync-utils` 同步到 `cloudfunctions/main/lib/`。先 sync, 然后部署云函数。

**Q: 我的 openid 在 dev tools 调试被拒了, 报"openid 不匹配"?**
A: 检查 `DEV_OPENIDS` 环境变量是不是设了你的 openid(逗号分隔支持多个)。dev tools 里 `wxContext.OPENID` 跟 login 返回的 openid **就是不一样**, 必须靠白名单绕过。

**Q: 主页转圈(spinner) 转不停?**
A: 看 [CE-A1](#-常见问题)。常见原因: (1) 没配 `DEV_OPENIDS`; (2) login 30s 后超时,`app.getOpenid()` 走兜底 `guest_xxx`, 但 B1 鉴权拒了; (3) `cloudfunctions/main` 没正确部署。

**Q: 测试挂了, 我改了 spaced-repetition.js 后?**
A: 跑 `npm test` 看具体哪个失败。如果 sync 相关失败, 跑 `npm run sync-utils:check` 验证是否 drift。

## 我想贡献代码

1. **改算法**: `utils/spaced-repetition.js` + 加测试 + 跑 `npm test` + `npm run sync-utils`
2. **改云函数**: `cloudfunctions/main/index.js` (慎改 22 个 case) 或 `cloudfunctions/main/modules/` (新增模块)
3. **改 UI**: `pages/<page>/*.js|*.wxml|*.wxss` + DevTools 模拟器验证
4. **改 PRD**: `docs/儿童识字应用_PRD_V2.5.0.md` + `docs/CHANGELOG.md` 加版本行
5. **新决策**: 创建 `docs/ADR/00N-xxx.md` 模板, 说明背景/备选/后果/实施

## 相关 agent 记忆

`~/.claude/projects/E--claude-PMRD-shizi/memory/` 下有 6 条跨会话经验, 包括:
- dev tools openid 行为 / B1 鉴权 / tabBar 跳转 / cloud function success 回调三分支等

读这些可避免重复踩坑。