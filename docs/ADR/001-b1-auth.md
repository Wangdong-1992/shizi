# ADR-001: B1 云函数鉴权拦截

- **状态**: 实施 (V2.5.2)
- **日期**: 2026-06-25
- **决策者**: 王栋
- **审计来源**: 4 维度架构审计 (2026-06-29)

## 背景

云函数 `main` 有 22 个 action, 全部信任客户端传的 `data.openid`。攻击者拿到任意 openid 就能读/写/删他人学习数据。

V2.3 时只考虑了密钥泄露和 V2.1 假阳性污染, 没考虑"客户端伪造 openid" 这条横向越权路径。

## 决策

云函数入口(`exports.main` 的 switch 之前)强制 `wxContext.OPENID` 校验。优先级:

1. **PUBLIC_ACTIONS 白名单** (`getOptions`/`getQuestionOptions`/`getAudio`): 跳过鉴权。这些是公共数据查询(只读 characters 表), 不涉及用户数据。
2. **devMode + DEV_OPENIDS 白名单**: dev tools 调试用。WeChat DevTools 里 `wxContext.OPENID` 与 login 返回的 openid **不一致**(DevTools 设计行为), 必须靠环境变量白名单绕过。
3. **生产路径**: `data.openid === wxContext.OPENID` 严格相等校验, 不等直接拒。

dev tools 端的 devMode 由 `app.js` 自动注入(envVersion === 'develop' 时给所有 `main` 云函数调用加 `devMode: true`)。

## 备选方案

### 方案 A: 每个 case 内部校验
- **优点**: 职责分离
- **缺点**: 22 个 case 各自加 4-5 行, 220+ 行重复, 新 action 容易漏

### 方案 B: 中间件模式
- **优点**: 标准化
- **缺点**: 微信云函数不支持 Express 中间件, 需要 wrapper 包装

### 方案 C (采用): 入口 switch 之前集中拦截
- **优点**: 单点拦截, 新 action 自动受益, 一目了然
- **缺点**: 集中判定逻辑在 main 入口, 与 switch 耦合

## 后果

- ✅ 21 个用户 action 全部强制鉴权
- ✅ dev tools 通过 `DEV_OPENIDS` 环境变量白名单放行
- ⚠️ 风险: 入口鉴权失败时 case 内部不再校验, 容易有人误以为"已鉴权" 而误用
- ⚠️ dev tools 多实例部署时, `DEV_OPENIDS` 必须每个实例一致 (云函数环境变量)
- ⚠️ 任何忘记加进 PUBLIC_ACTIONS 的新 action 都会被强制鉴权, 可能误拦公共接口

## 实施

`cloudfunctions/main/index.js` switch 之前 (line 526-548), 文档见 `docs/CLAUDE.md` "B1 云函数鉴权拦截" 约定。

devMode 注入: `app.js:25-46` monkey-patch `wx.cloud.callFunction` (envVersion='develop' 时)。

测试覆盖: `scripts/smoke-test-ui-v252.md` TC-A1/A2/A3 (3 个测试用例)。

## 后续

- 多实例部署时, 需在云开发控制台统一所有 `main` 实例的 `DEV_OPENIDS` (当前已实现)
- 未来如新增 action, 需明确: 是公共 action (加 PUBLIC_ACTIONS) 还是用户 action (无需加, 走 B1 自动校验)
- 未来如引入 token-based auth, 需重构为标准中间件 (见 ADR 待定)