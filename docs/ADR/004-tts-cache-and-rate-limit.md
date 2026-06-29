# ADR-004: TTS URL 缓存 + IP 限流

- **状态**: 实施 (V2.5.2 P1-3 + V2.5.3 重构到 modules/baidu.js)
- **日期**: 2026-06-29
- **决策者**: 王栋
- **审计来源**: 4 维度架构审计 + 成本风险评估

## 背景

`getAudio` action 在 `PUBLIC_ACTIONS` 白名单 (B1 鉴权跳过), 任何人都能调百度 TTS API。风险:

1. **成本失控**: 恶意用户能瞬间打爆百度 TTS 配额, 产生费用
2. **重复调用**: 同一字符+拼音的 TTS URL 每次都重新计算 token + 拼接 URL, 浪费资源

## 决策

### 1. TTS URL 24h 永久 cache

- key: 文本(char 或 pinyin)
- value: `{ url, expiresAt }`
- 字符+拼音组合共 ~4500 种, 24h TTL 基本永久命中
- 防御性: 超过 10000 条清一半老的, 防止长期内存占用

### 2. ASR/TTS IP 限流

- getAudio (PUBLIC_ACTIONS, 60/min/IP): 防刷
- recognizeVoice (走 B1 鉴权, 30/min/IP): ASR 比 TTS 贵, 限更严
- in-memory Map (云函数实例内有效, 多实例不严格)

## 备选方案

### 方案 A: 改用有 token 鉴权的接口
- **优点**: 解决滥用
- **缺点**: 改 API 接入方式, 与微信生态不兼容

### 方案 B: IP rate limit 走云数据库
- **优点**: 多实例一致
- **缺点**: 每次调用多一次 DB 读, 反而拖慢

### 方案 C (采用): in-memory cache + in-memory rate limit
- **优点**: 0 额外 IO, 简单, 单实例够用
- **缺点**: 多实例不严格(攻击者用多 IP + 多实例入口可以绕过)

## 后果

- ✅ TTS 调用频次预估降 90%+ (cache 命中)
- ✅ 命中后 0 次百度 API 调用
- ✅ 防止恶意刷爆百度配额
- ⚠️ 多实例部署时, 单实例限流不严格(总配额仍是 N × 单实例上限)
- ⚠️ 缓存 + 限流是进程内 in-memory, 冷启动后清空 (无害, 重新走一遍)

## 实施

- `cloudfunctions/main/modules/baidu.js` `createBaiduClient()` 工厂返回带 cache + rate limit 的 client
- `ttsUrlCache` Map + 24h TTL
- `rateLimitBuckets` Map + 60s 滑动窗口
- `getClientIp()` 从 `wxContext.CLIENTIP` 取 IP
- 防御性: 超过 10000 条 cache 触发 LRU-style 清理

## 后续

- 用户量 > 5000 时考虑 Redis 限流(单实例限流不够)
- `getAudio` 真正想要严格防护, 应移到独立云函数 `main-voice` + 加 CDN 缓存 TTS 文件
- 后续可考虑音频文件级别缓存(baidu TTS 返音频流, 转存云存储, 永久 cache)