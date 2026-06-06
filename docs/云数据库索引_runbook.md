# 云数据库索引 Runbook

> 微信云开发**不支持代码 createIndex**,索引必须**在云开发控制台手动建**。
> 本 runbook 列出 8 个必需索引,按表操作约 5 分钟完成。

## 为什么必须建

随着用户量增长,以下查询会**全表扫描**变慢。提前建好组合索引能让:

- `getPendingReview` 复习调度 — 按 `openid + next_review_date` 排序直达
- `getStats` / `getMasteredChars` 首页统计 — 按 `openid + status` 直查"已掌握"
- `recordLearn` / `recordReview` / `getLearnChar` — 唯一索引保证不重复
- `cleanReviewLogs` R-16 清洗 — 按 `data_quality + reviewed_at` 走索引

用户量 <1000 时没索引也能跑,但**生产环境强烈建议上线前建完**。

## 控制台入口

微信云开发控制台 → 数据库 → 选集合 → 顶部"**索引管理**"标签 → "**添加索引**"

## 8 个索引清单

按"集合"分组,每组建完后**等几秒**再进下一组(索引后台异步建)。

### 集合 1:`learning_progress` (4 个,最关键)

| # | 索引名(建议) | 字段 | 顺序 | 唯一 | 用途 |
|---|------|------|------|------|------|
| 1 | `openid_next_review_date_idx` | `openid`, `next_review_date` | 升序, 升序 | 否 | `getPendingReview` 按用户过滤 + 按下次复习日期排序 |
| 2 | `openid_status_idx` | `openid`, `status` | 升序, 升序 | 否 | `getStats`/`getMasteredChars` 按 `status in [familiar,mastered,solid]` 查"已掌握" |
| 3 | `openid_char_id_unique` | `openid`, `char_id` | 升序, 升序 | **是** | `recordLearn`/`recordReview`/`getLearnChar` 按字 upsert(必须唯一,避免重复记录) |
| 4 | `openid_first_learn_date_idx` | `openid`, `first_learn_date` | 升序, 升序 | 否 | `getDailyStats` 查"今日新学" |

### 集合 2:`review_logs` (2 个)

| # | 索引名(建议) | 字段 | 顺序 | 唯一 | 用途 |
|---|------|------|------|------|------|
| 5 | `openid_reviewed_at_desc_idx` | `openid`, `reviewed_at` | 升序, **降序** | 否 | 个人复习历史按时间倒序 |
| 6 | `data_quality_reviewed_at_idx` | `data_quality`, `reviewed_at` | 升序, 升序 | 否 | `cleanReviewLogs` 找未清洗的 V2.1 假阳性记录 |

### 集合 3:`users` (2 个)

| # | 索引名(建议) | 字段 | 顺序 | 唯一 | 用途 |
|---|------|------|------|------|------|
| 7 | `openid_unique` | `openid` | 升序 | **是** | 所有 action 入口过滤(必须唯一) |
| 8 | `push_subscribed_idx` | `push_subscribed` | 升序 | 否 | `sendReviewReminder` 找订阅用户批量推送 |

> 索引 #7 微信云开发**通常自动建**(openid 是主识别字段),如未自动建请手动补。

### 集合 4:`achievement_log` / `reward_logs`

**当前未列出索引**(查询量小,未观察到性能问题)。如未来 `getAchievements` 慢可加 `{openid: 1}` 升序索引。

## 操作步骤(以 `learning_progress` 索引 #1 为例)

1. 云开发控制台 → **数据库** → 选 `learning_progress` 集合
2. 顶部标签 → "**索引管理**"
3. 点 "**添加索引**" 按钮
4. 填写:
   - **索引名**:`openid_next_review_date_idx`(按上表名字填)
   - **字段**:点 "+" 加两行
     - 行 1:`openid` → 升序
     - 行 2:`next_review_date` → 升序
   - **是否唯一**:**否**(只有 #3 和 #7 选"是")
5. 点"确定" → 等待 2-3 秒 → 列表出现新索引 = 建好
6. 重复上述步骤建同集合剩余 3 个索引
7. 切到 `review_logs` 集合,再建 2 个
8. 切到 `users` 集合,再建 2 个

**总耗时约 5 分钟**(8 次点击,等几秒)。

## 验证索引生效(可选,云函数调试用)

云函数里加 `.explain()` 调:

```js
const explainRes = await db.collection('learning_progress')
  .where({ openid, status: _.in(['familiar', 'mastered', 'solid']) })
  .explain();
console.log(JSON.stringify(explainRes));  // 看 queryPlanner.indexName 是否命中索引
```

`indexName` 不为空 = 命中,空字符串 = 全表扫描。

## 排错

- **报错"索引已存在"** → 已有同名索引,跳过该条
- **报错"字段不存在"** → 集合为空(没有该字段的文档),建索引不要求有数据,但字段名要拼对
- **报错"唯一约束冲突"** → 已有重复数据,先 `db.collection('xxx').aggregate().group({...})` 找重复,清理后重建
- **建好后查询没变快** → 微信云开发索引**最终一致**,极端情况下有几秒延迟

## 参考

- 完整索引设计理由:见 `docs/CLAUDE.md` → "🔧 云数据库索引(性能必需)" 章节
- 数据集合结构:见 `docs/CLAUDE.md` → "云数据库集合" 章节
