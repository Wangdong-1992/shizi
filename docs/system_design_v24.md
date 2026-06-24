# V2.4 系统设计文档 — 描红字形贴合优化

> **变更纪要** · 编写日期 2026-06-02
>
> 本文档记录 V2.3 → V2.4 的设计变更。**V2.4 聚焦"描红体验"的字形贴合度**——底字和引导线来自同源数据,实现 100% 视觉对齐。

> ⚠️ **V2.5.1 已删除描红功能(Step3),本文档仅作历史参考**。V2.4 的全部设计(SVG path 同源、系统楷体 fallback、按年龄容差 DTW 评分)随描红功能移除而废弃。

---

## 0. 调研背景

V2.3 阶段用户反馈"描红第一笔描不上",我们做了**横纵分析法**调研(报告:`./描红功能调研_横纵分析报告.md` 根目录,PDF 同名),核心发现:

- **没有任何主流产品做到"字形数据与标准楷体字模像素级对齐"**
- 排名:**洪恩识字 9.0**(自研美术资产同源) > **河小象 8.5**(浙大书法老师真人书写) > **有道 7.5**(全字库) > **shizi V2.3 6.0**(数据用 Make Me a Hanzi,渲染用系统 sans-serif)
- 行业真空带 = **底字和引导线不同源**导致的视觉错位

## 1. 根因分析

### 1.1 V2.3 现状的问题

```js
// pages/learn/learn.js:741-745
ctx.font = '140px sans-serif';  // 底字用系统 sans-serif 字体
ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(self.data.currentChar, canvasWidth / 2, canvasHeight / 2);

// pages/learn/learn.js:784-818
// 虚线引导用 medians 点序列(来自 Make Me a Hanzi 的 Arphic 楷体)
```

**三层数据不同源:**
1. 底字 = 系统 sans-serif 字体
2. 虚线 = Make Me a Hanzi 中线点(Arphic 楷体)
3. 字体声明 = "sans-serif"

→ 底字和引导线**永远对不上**。

### 1.2 解法对比(3 个方案)

| 方案 | 原理 | 工作量 | 数据体积 |
|------|------|--------|----------|
| **A: 引入 Hanzi Writer** | 完整集成开源库(含 quiz/错字检测/评分) | 2-3 天 | 30KB 核心 + 字符数据 |
| **B: 自研 + SVG path 数据(本项目选)** | 自己渲染底字 SVG path,虚线用 medians | 1-2 天 | 3MB 总,放云函数 |
| **C: 维持现状 + 局部优化** | 字号自适应 + 字体改楷体 fallback | 半天 | 不变 |

**选 B 的理由:**
- 改动小、风险低、收益大(底字和引导线 100% 贴合同一字形)
- 保留自研 + 自校准 stroke-data.js 流程
- 集成成本比 A 低

## 2. V2.4 阶段 1(已上线):系统楷体 fallback

**改动:** `pages/learn/learn.js:741` + `learn.js:776` 底字字体

```js
// 旧
ctx.font = '140px sans-serif';

// 新
ctx.font = '140px "Kaiti", "STKaiti", "楷体", serif';
```

**效果:** 比 sans-serif 接近 Arphic 楷体,但系统楷体各家略有差异(各家系统实现不同),**无法 100% 贴合**。

**上线状态:** 已生效。

## 3. V2.4 阶段 2(实现中):SVG path 异步加载

### 3.1 核心思路

**底字和虚线引导**用**同一份数据源**(Make Me a Hanzi 的 SVG path) → 100% 贴合。

但完整数据(svgPath)是 4.5MB,超过主包 2MB 限制。**解法:** 拆 2256 个 JSON 到云函数本地,前端异步按字加载。

### 3.2 数据架构(从 1.6MB 主包 → 4.5MB 云函数本地)

| 位置 | 内容 | 大小 | 用途 |
|------|------|------|------|
| `utils/stroke-data.js` | 2256 字 medians(无 svgPath) | 1.6MB | 主包,无白屏立即显示 |
| `cloudfunctions/main/strokeCache/<字>.json` | 2256 字 medians + svgPath | 4.5MB 总,1-3KB/字 | 云函数本地,异步按字拉 |

**为什么拆 JSON 不放主包:**
- 完整 svgPath 数据 4.5MB → 超过主包 2MB 限制
- 拆成 2256 个 JSON → 每个 1-3KB,主包只引缓存(`wx.setStorageSync` 1-3KB OK)
- 缓存命中后**不查云函数**

### 3.3 数据生成流程

**`scripts/convert-stroke-data.js`** 新增 CLI 模式:

```bash
# 默认 JS 模式(主包用,无 svgPath)
node scripts/convert-stroke-data.js
# → 输出 utils/stroke-data.js(1.6MB)

# JSON 模式(云函数本地用,带 svgPath)
node scripts/convert-stroke-data.js --mode=json
# → 输出 cloudfunctions/main/strokeCache/<字>.json(4.5MB 总)
```

**`scaleSvgPath` 函数要点:**
- toFixed 1(精度 0.1 = 0.2 屏幕像素,儿童描红够用)
- Q/C 贝塞尔 → L 直线(节省 40-50% 数据)

### 3.4 加载流程

```
用户进 Step3
  ↓ 0ms
initStep3 同步读 utils/stroke-data.js
  ↓
setData strokePaths (medians) + drawStrokeGuide
  ↓ 200-400ms
底字用 Kaiti 系统楷体显示(阶段 1 兜底)
  ↓
异步 loadStrokeData 拉云函数 strokeCache
  ↓ 200-500ms
拉到 → setData strokePaths (含 svgPath) + 重绘 canvas
  ↓
底字变成 SVG path 渲染(100% 贴合 Make Me a Hanzi Arphic 楷体)
  ↓
拉失败 → fallback 同步数据(用户无感,功能完整)
```

**关键代码路径:**

`loadStrokeData(char)` 异步函数:
1. 查 `wx.getStorageSync('stroke_v2_<字>')` 本地缓存(带版本号,数据格式变更时老缓存自动失效)
2. 缓存命中且含 svgPath → 直接返回
3. 缓存未命中 → `wx.cloud.callFunction({name: 'main', data: {action: 'getStrokeData', data: {char}}})`
4. 拉到数据 → `wx.setStorageSync` 写回缓存
5. 第二次进同字 → 缓存命中,0 延迟

`initStep3()` 改造:
1. 同步读 `StrokeData.getStrokeData()` (medians-only) 立即显示
2. 异步 `loadStrokeData` 拉 strokeCache
3. 拉到后 `setData({strokePaths: newData})` + `drawStrokeGuide()` 重绘
4. 失败 fallback 同步数据(用户无感)

### 3.5 云函数 `getStrokeData` action

**位置:** `cloudfunctions/main/index.js` switch 末尾

**支持单字查 + 批量查(用 | 分隔):**

```js
// 单字
case 'getStrokeData': {
  const { char } = data;
  if (char.length === 1) {
    const filePath = path.join(STROKE_CACHE_DIR, char + '.json');
    // 读文件返回...
  }
  // 批量
  if (char.indexOf('|') >= 0) {
    // 按 | 分割,逐字读
  }
}
```

**文件路径:** `cloudfunctions/main/strokeCache/<字>.json`(汉字文件名 UTF-8,微信云函数 fs 支持)

## 4. 验收清单

| 项 | 期望 |
|-----|------|
| 描红页底字 100% 贴合引导线 | "住"字"亻"撇与引导线完全重合 |
| 网络断开不崩 | 关闭云函数/断网,描红页仍能进(降级到 Kaiti 楷体) |
| 第二次进同字 0 延迟 | 同一字第二次进入,描红页底字瞬间显示(本地缓存命中) |
| 数据生成时间 | JS 模式 1-2 秒;JSON 模式 3-5 秒 |
| 主包大小 | ≤ 1.6MB(JS 模式数据,无 svgPath) |
| 云函数部署包 | ≤ 4.5MB(strokeCache 一起) |

## 5. 已知风险

| 风险 | 缓解 |
|------|------|
| 微信云函数 fs 对汉字文件名兼容性 | 已验证 OK(读 `住.json` 测试通过) |
| 首次进入描红页有 200-500ms 延迟 | 用 medians 同步数据兜底,无白屏 |
| 4.5MB 部署包大小 | 微信云函数限制 50MB,远低于 |
| 缓存失效(用户清缓存) | 拉一次后写回,网络断开 fallback 同步数据 |
| strokeCache 漏字 | `loadStrokeData` 失败 catch,fallback 同步数据(降级到阶段 1) |

## 6. 已完成 vs 待完成

### Day 1(已完成)
- [x] 改 `scripts/convert-stroke-data.js` 加 JSON 模式
- [x] 跑脚本生成 2256 个 strokeCache JSON(4.5MB)
- [x] 加 `getStrokeData` 云函数 action(单字 + 批量)
- [x] 测试云函数读 `住.json` 通过

### Day 2(已完成)
- [x] `pages/learn/learn.js` 加 `loadStrokeData` + `preloadStrokeData` 异步函数
- [x] 改 `initStep3` 异步加载 + 失败 fallback
- [x] 缓存策略(`wx.getStorageSync` / `wx.setStorageSync`)

### 待完成
- [ ] 用户端到端验收(描红页 + 缓存 + fallback)
- [ ] **commit + push V2.4 改动**(V2.4 阶段 2 未提交)
- [x] ~~DTW 评分(方案 B Step 3 锦上添花)~~ — **V2.5 已用 hanzi-writer 4-check 重做,见 `docs/CLAUDE.md` 描红评分升级章节 + `utils/stroke-grader.js`**
- [x] ~~容错率分龄(参考洪恩经验)~~ — **V2.5 已在 stroke-grader 实现:年龄 → leniency 映射(3岁 2.0 / 6岁 1.0)**

## 7. 相关文件

| 文件 | 说明 |
|------|------|
| `scripts/convert-stroke-data.js` | 数据生成脚本(JS 模式 + JSON 模式) |
| `cloudfunctions/main/strokeCache/<字>.json` | 2256 个笔顺数据(含 svgPath) |
| `cloudfunctions/main/index.js` | `getStrokeData` action |
| `pages/learn/learn.js` | `loadStrokeData` + `preloadStrokeData` + 改 `initStep3` |
| `docs/CLAUDE.md` | 加 V2.4 章节(已完成) |
| `README.md` | 加 V2.4 版本表(已完成) |
| `docs/描红功能调研_横纵分析报告.md` | 调研依据(根目录 + PDF) |

## 8. 与 V2.3 的边界

V2.4 不动 V2.3 的 P0 修复(密钥剥离、learning_progress 同步、假阳性过滤、TTS 重试)。V2.4 是在 V2.3 安全数据基础上的**描红体验增强**。

V2.4 也不动 V2.3 的 4 个 P1 修复(tabBar 生命周期、状态机残留、配额残留、countUpBatch 参数名)。

V2.4 仅在 `pages/learn/learn.js` 和 `cloudfunctions/main/index.js` 加东西,不动其他云函数 / 其他页面 / 数据库结构。
