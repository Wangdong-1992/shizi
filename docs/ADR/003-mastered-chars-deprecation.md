# ADR-003: `users.mastered_chars` 老字段退役

- **状态**: 实施 (V2.5.3)
- **日期**: 2026-06-29
- **决策者**: 王栋
- **审计来源**: 4 维度架构审计

## 背景

`users.mastered_chars` 是 V2.0 之前的"已掌握字"数组, 字段在 V2.1 假阳性期被 56% 污染。

V2.3 引入了 `learning_progress.status` 作为新的"已掌握"真相源, 改了**读路径**(`getStats` / `getMasteredChars` 改用 learning_progress), 但**写路径没改**: `recordLearn` 仍 `mastered_chars.push(charIdStr)`。

V2.5.2 P0-2 修复时只改了读路径的兜底逻辑, 写入路径依然存在。

后果: 一旦 `recordLearn` 的 `learning_progress` 写入抛错 (B5 修复的触发条件), `mastered_chars` 已 push, 出现"已掌握但不进复习队列"的双源不一致。

## 决策

`users.mastered_chars` 字段**退役写入, 只保留只读 fallback**。

- **写入路径**: `recordLearn` 不再 push `mastered_chars`。改为在写入前查询 `learning_progress` 是否存在, 作为"是否首次学"的判断依据。
- **读取路径**: `getStats` / `getAchievements` / `getPendingReview` 在 `learning_progress` 查询失败时**仍**降级到 `mastered_chars` (防御性)。
- **新用户创建**: `wxLogin` 和 `getNextChar` 仍设 `mastered_chars: []` (空数组占位, 不写入实际数据)。
- **迁移**: `migrateProgress` 仍读 `mastered_chars` 作为迁移源(V2.1 老数据)。
- **清理**: 可选跑一次 `unset(mastered_chars)` 清理老数据(本次未做, 留待后续)。

## 备选方案

### 方案 A: 完全删除 `mastered_chars` 字段
- **优点**: 彻底无老数据
- **缺点**: V2.1 老用户没有 learning_progress 记录, 删了会丢数据(虽然 migrateProgress 会补, 但补失败的兜底也没了)

### 方案 B (采用): 退役写入, 保留只读 fallback
- **优点**: V2.3 修读路径时, 兜底机制依然有效
- **缺点**: 字段仍占存储, 偶有冗余

### 方案 C: 先迁移再删
- 强制所有老用户重跑 `migrateProgress`, 然后 unset 字段
- **优点**: 真正清理
- **缺点**: migrateProgress 失败的兜底就消失

## 后果

- ✅ 双源不一致路径彻底关闭
- ✅ V2.3 修读路径时定的"防御性 fallback" 仍有效
- ⚠️ 老用户的 `mastered_chars` 仍是历史状态(不影响功能)
- ⚠️ 未来如需完全清理, 需跑一次 unset 脚本

## 实施

- `cloudfunctions/main/index.js` `recordLearn`:
  - 删 `let masteredChars = user.mastered_chars || [];`
  - 删 `masteredChars.push(charIdStr);`
  - 删 update payload 里的 `mastered_chars: masteredChars`
  - 加 learning_progress 查询判断"是否首次学", 改用 `learning_progress` 计数给成就解锁

## 后续

- 跑 `cloudfunctions/fixData/` 加一个 `unsetMasteredChars` 脚本, 让运维可选择性清理
- 数据迁移后 3-6 个月观察期, 确认无 fallback 触发, 再彻底删字段
- `docs/CHANGELOG.md` V2.5.3 段已记录此变更