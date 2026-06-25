# V2.5.2 冒烟测试 — UI 层手动清单

> 跟 `scripts/smoke-test-ui.md`(V2.3 版)配套。V2.5.2 是 bug 修复批次,本清单覆盖 26 个修复中的高频 UI 场景。
>
> **关键前置**:本批次含 **B1 云函数鉴权拦截** + **DEV_OPENIDS 调试白名单**,验证前必须先确认环境配置。

## 前置

- [ ] 已部署 V2.5.2 代码(`cloudfunctions/main` 已上传)
- [ ] **dev tools 路径**:云函数 `main` 配置 → 环境变量加 `DEV_OPENIDS=<你的 openid>`(获取:`console.log(app.globalData.openid)`)
- [ ] **生产路径验证**(可选,但建议):把 `DEV_OPENIDS` 清空再部署一份 staging,验证所有用户操作类 action 都被 openid 校验拦住
- [ ] 已登录(已走完 `wxLogin`)
- [ ] 微信开发者工具 → 模拟器 → 打开 Console(看日志用)
- [ ] DevTools Console 启动时能看到 `[devMode] 自动注入 devMode=true for main 云函数`(dev tools 标记)

---

## P0 鉴权拦截(B1)

### TC-A1:dev tools 路径能正常工作(白名单放行)

**目的**:验证 DEV_OPENIDS 白名单机制不破坏 dev tools 调试

**步骤**:
1. 配置 DEV_OPENIDS 为你的 openid
2. 重启模拟器
3. 进首页 → 8s 内加载完(stats/成就/待复习都有数据)
4. 进复习页 → 点播放 → 听到发音
5. 进设置 → 清除学习数据 → 不报"鉴权失败"

**通过条件**: 5 个操作都成功,Console 没有"鉴权失败:xxx"

---

### TC-A2:dev tools 白名单外的 openid 被拒

**目的**:验证白名单严格性

**步骤**:
1. 把 DEV_OPENIDS 改为 `oovtH3bEadvlY-WRONG`(故意错的 openid)
2. 重启模拟器,清缓存重登
3. 进首页 → 4 个云函数全失败 → Console 应看到 4 次 `鉴权失败: devMode 未授权`

**通过条件**: 看到 4 次 devMode 未授权错误(说明白名单生效,**且只有你的真 openid 能用**)

---

### TC-A3:生产路径(无 DEV_OPENIDS)拦 dev tools 调试

**目的**:验证 dev tools 在生产模式下被严格拦下,不会有意外绕过

**步骤**:
1. 云函数 `main` 把 `DEV_OPENIDS` 设为空字符串
2. 重启模拟器
3. 进首页 → Console 应该看到 `鉴权失败: openid 不匹配`(wxContext.OPENID ≠ data.openid)

**通过条件**: 看到鉴权失败,所有云函数拒绝(说明生产路径正确生效,**dev 工具无法绕过**)

---

## P0 数据一致性(B5/B6)

### TC-B1:recordLearn 失败时前端能感知

**目的**:B5 修复,失败不再静默

**步骤**:
1. (手动注入失败条件较难,改用日志验证)在云函数 `main` 临时给 `recordLearn` 加 `throw new Error('test fail')` 验证后撤回
2. 客户端 → 学一个字 → 学完提交
3. 应该看到 console `recordLearn: learning_progress 同步失败` + 返回 success:false

**通过条件**: 失败语义正确传递给前端(成功路径在生产不需要验证,改回去即可)

> **注**:B5 的失败路径极少触发,生产通常测不到。可以用 console 手动调:
> ```js
> wx.cloud.callFunction({ name: 'main', data: { action: 'recordLearn', data: { openid: app.globalData.openid, charId: '1', isAssisted: false } } }).then(r => console.log(JSON.stringify(r)))
> ```
> 看返回 success 字段。

---

### TC-B2:recordReview 失败时前端能感知

**目的**:B6 修复,progress 失败不再静默

**步骤**:同 TC-B1,但测 `recordReview` action

---

## P0 老字段退役(B7/B8)

### TC-C1:getNextChar 返回新学过的字不被推

**目的**:V2.3 漏改,新学字 `mastered_chars=[]` 被当新字

**步骤**:
1. 学一个字(比如 "大"),recordLearn 后 `mastered_chars.push('3')` + learning_progress 创建
2. 进首页或复习 → **不应该** 出现 "大" 作为新字
3. Cloud function console 看 `getNextChar` 日志,确认查的是 `learning_progress.status in [familiar,mastered,solid]`

**通过条件**: 已学过的字不再出现

---

### TC-C2:getAchievements 数字跟 getStats 一致

**目的**:V2.3 漏改,成就页假阳性

**步骤**:
1. 首页记 mastered_count = N
2. 进成就页(或者通过 wx.cloud.callFunction 调 getAchievements)
3. 两个数字应该**完全一致**(都用 learning_progress 查)

**通过条件**: 一致

---

## P0 前端 UX(B9-B12)

### TC-D1:学习页三步流程能完整跑通(V2.5.1 删描红后)

**目的**:B9 修复,stepResults[3] 越界写入

**步骤**:
1. 进学习页学新字,完成 Step1(释义)+ Step2(再认)+ Step4(跟读)
2. 看到"学会了"庆祝 + mastered_count +1
3. 进首页 → 已掌握数字 +1(说明 recordLearn 真的被调用了)

**通过条件**: 三步走通,mastered_count 正确增加

---

### TC-D2:复习页"播放失败"不再卡住

**目的**:B11 修复,ASR 失败时 asrProcessing 回滚

**步骤**:
1. 进复习页 → 点播放按钮(没字的发音也能模拟失败)
2. 如果 TTS 调用失败 → 应该看到 toast "加载选项失败,请重试" 而不是永久转圈

**通过条件**: 转圈消失,toast 出现,用户能感知失败

---

### TC-D3:首页切 tab 来回不闪烁

**目的**:B12 修复,onShow 并发 setData 竞争

**步骤**:
1. 进复习页 → 答几道题
2. 切到首页 tab → 数据应该正常(无 entranceReady 闪烁)
3. 再切到复习 → 再切回首页 → 应该**不会** 重新触发入场动画

**通过条件**: 入场动画只在首次加载播放,后续切 tab 不重播

---

## P1 修复(M1/M2/M4/M5/M6/M7/M8/M10/M11)

### TC-E1:复习页录音切 tab 不残留

**目的**:M1 修复,onUnload 清理 recorderManager

**步骤**:
1. 进复习"看字说音"模式 → 按住录音不放(进入录音中状态)
2. 不松手,直接点 tabBar "首页"
3. 切到 learn / review / profile 各 tab 来回
4. **不应该** 看到麦克风持续占用图标(浏览器/devtools 调试器里看到)

**通过条件**: 离开 review 页后麦克风立即释放

---

### TC-E2:设置页复习提醒开关拒绝后回滚

**目的**:M2 修复,switch 状态回滚

**步骤**:
1. 进设置 → 复习提醒 → 拨到开
2. 弹订阅消息授权 → 点"拒绝"
3. switch 应该**自动拨回关**(UI 与服务端一致)

**通过条件**: switch 视觉回到关闭,后端 `push_subscribed` 也是 false

---

### TC-E3:已掌握页切回来刷新

**目的**:M4 修复,onShow 重新拉数据

**步骤**:
1. 进已掌握页 → 记字符数 N
2. 学一个新字(让 mastered_count +1)
3. 回到已掌握页(直接点 tabBar 切回,**不退出**)
4. 字符数应该 = N+1

**通过条件**: 字符数实时更新

---

### TC-E4:已掌握页网络失败显示"加载失败"

**目的**:M5 修复,区分空状态 vs 网络错误

**步骤**:
1. 关掉网络(DevTools → Network → Offline)
2. 进已掌握页
3. 应该显示"😢 加载失败 / 点击重试",**不是**"还没有掌握汉字哦"

**通过条件**: 显示网络错误状态(且恢复网络后点重试能加载)

---

### TC-E5:学习页小复习完成点"继续学习"状态干净

**目的**:M6/M8 修复,reset 覆盖所有字段

**步骤**:
1. 学 3 个字触发小复习 → 答完小复习 → 点"继续学习"
2. 新字进入时,不应该:
   - 直接显示"学会了"弹窗(说明 learnCompleted 残留)
   - 录音按钮在录音中状态残留
   - 显示上次的选项内容
3. 应该正常从 Step1 释义开始

**通过条件**: 状态完全干净,像新会话一样

---

### TC-E6:录音短按(< 0.5s)不污染下一次录音

**目的**:M7 修复,timer 句柄不泄漏

**步骤**:
1. 按下录音 → 立刻松开(< 0.5s,看到"按住时间太短了")
2. 立刻再按一次 → 正常时长松开
3. **不应该** 出现识别分数异常 / 录音被中途强停

**通过条件**: 第二次录音正常完成识别

---

### TC-E7:跳天学习后 streak_count 重置

**目的**:M10 修复,PRD"连续学习"语义

**步骤**:
1. 学一个字 → streak = 1
2. 学第二个字 → streak = 2
3. **手动改 last_learn_date 到 3 天前**(云数据库 console)
4. 学第三个字 → streak 应该 = 1(不是 3)

**通过条件**: 跳天后 streak 重置

> **注**:不方便改数据库的话,可以本地调 `recordLearn` 时手动传 `last_learn_date` 字段(后端优先用 user 里的值,所以要在数据库改)。

---

## 现场发现修复

### TC-F1:学习页"去复习"按钮能跳转

**目的**:tabBar 跳转用 switchTab

**步骤**:
1. 学满每日配额触发"今日新字已达标"模态
2. 点"去复习"按钮 → 应该跳到复习 tab(显示复习题)
3. **不应该** 点完没反应

**通过条件**: 跳转成功,显示复习题

---

### TC-F2:首页 spinner 不再永远转

**目的**:getOpenid 8s 兜底超时

**步骤**:
1. (模拟)DevTools → Network → Throttling 设 Slow 3G
2. 重启模拟器(让 login 慢)
3. 首页应该 **最多 8s** 内显示 fallback 数据(stats 全 0 + 成就页空)

**通过条件**: spinner 最多 8s 消失,fallback 显示

---

### TC-F3:review 控制台无 comboLevel undefined 警告

**目的**:comboLevel setData 警告

**步骤**:
1. 进复习页 → 答对 3 道题触发连击
2. Console 搜 `Setting data field` → **不应该** 出现 `comboLevel` 相关警告

**通过条件**: Console 干净

---

## 验证清单汇总

| TC | 描述 | 通过 |
|---|------|------|
| A1 | dev tools 白名单放行 | ☐ |
| A2 | 白名单外 openid 拒 | ☐ |
| A3 | 生产路径拦 dev tools | ☐ |
| B1 | recordLearn 失败可感知 | ☐ |
| B2 | recordReview 失败可感知 | ☐ |
| C1 | getNextChar 不推已学 | ☐ |
| C2 | 成就数字跟首页一致 | ☐ |
| D1 | 学习页三步走通 | ☐ |
| D2 | 复习播放失败不卡死 | ☐ |
| D3 | 首页切 tab 不闪烁 | ☐ |
| E1 | 录音切 tab 释放麦克风 | ☐ |
| E2 | 复习提醒拒绝回滚 | ☐ |
| E3 | 已掌握切回刷新 | ☐ |
| E4 | 已掌握网络错误显示 | ☐ |
| E5 | 小复习完成状态干净 | ☐ |
| E6 | 录音短按不污染下次 | ☐ |
| E7 | 跳天 streak 重置 | ☐ |
| F1 | 去复习按钮跳转 | ☐ |
| F2 | 首页 spinner 8s 兜底 | ☐ |
| F3 | comboLevel 无警告 | ☐ |

**总耗时约 30-45 分钟**(包含 DEV_OPENIDS 切换)。

## 已知不验证项

- **TC-B1/B2 失败路径**需要手动注入云函数错误条件才能测,生产触发率极低,仅验证逻辑分支。
- **TC-A2/A3** 是负面测试(验证被拒),可能跟你的日常使用流程冲突,可以在 staging 环境测。

## 参考

- B1 鉴权设计:`docs/CLAUDE.md` "开发约定 12. B1 云函数鉴权拦截"
- M10 streak 跳天重置:`cloudfunctions/main/index.js` recordLearn 段
- V2.3 测试用例(可对比):`scripts/smoke-test-ui.md`