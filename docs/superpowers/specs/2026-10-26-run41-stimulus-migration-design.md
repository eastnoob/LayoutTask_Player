# Run 41 刺激池与重复刺激顺序约束设计

**状态：** Draft，待用户审阅；本文件只定义本地 LayoutTask 迁移，不授权部署。

## 目标

将当前正式任务池替换为 Run 41 对应的刺激池，并重新生成与该任务池匹配的 sequence、任务配置和 scoring reference，同时保持现有 Player 的交互、教程、保存格式和评分语义不变。

用户特别要求两个重复刺激在任何 sequence 中都不能前后相邻。该约束必须由生成器强制验证，而不是依赖人工检查。

Run 41 本阶段只使用 persistent reference condition：参考图持续显示在平面图上方；不使用 `preview_10s`，不添加十秒倒计时或自动结束逻辑。

## 事实、推断与待确认事项

### 已观察事实

- 当前候选目录为 `E:\260917\sample\run_41_repeat1_24presentations`。
- 该目录的 manifest 记录：23 个唯一刺激、24 次 presentation、1 个额外重复 presentation，重复 row 为 `2527`，combination ID 为 `7f0cb5e894b1`。
- 该目录包含 `unique_stimuli.csv`、`presentation_inventory.csv`、`repeat_manifest.csv`、`method.md` 和一个 repeat review 图片，但不包含完整的 LayoutTask trial protocol、家具定义和 canonical target 表。
- Run 41 目录声明其来源为 `run_37/native_23`；完整场景和答案需要从只读的 `E:\260917\data.csv` 与 `E:\260917\sample\run_37\native_23` 读取。
- `E:\260917\sample\run_42_repeat2_25presentations` 记录的是 23 个唯一刺激加两个重复 presentation，重复 row 为 `2527` 和 `1115`。
- 当前代码已经有 Williams sequence 生成器、batch compiler、Run 37 输入适配器和 persistent reference mode。
- 当前工作区存在 Run 37 相关未提交修改，不能通过批量清理或覆盖来准备 Run 41。

### 用户确认的决定

- 先完成本地 LayoutTask，最后才进入静态仓库和 VPS 部署。
- Run 41 不使用十秒模式；正式配置必须是 `reference_mode: "persistent"`。
- 需要重新生成 sequence，并强制保证两个重复刺激不相邻。
- 旧任务、旧静态包、旧评分表和历史数据不能被删除或覆盖。

### 必须在实现前解决的矛盾

用户描述的是“两个重复刺激”，但当前 Run 41 manifest 只识别到一个重复刺激身份。实现不得自动把 Run 42 当作 Run 41，也不得静默把一个重复刺激扩展成两个。

实现的第一道门是重新读取 Run 41 输入并确认以下条件：

1. Run 41 的最终输入明确列出两个 distinct repeat task IDs；或
2. 用户确认当前 Run 41 的真实定义只有一个 repeat task ID，并接受相应的 sequence 规则。

若条件不成立，停止生成并向用户报告实际 manifest、重复身份和需要提供的正确输入目录。不会生成半成品 package、sequence 或配置。

## 方案范围

### 本阶段包含

- Run 41 输入快照与哈希记录；
- 从 Run 41 inventory 连接到 Run 37/native_23 的 canonical trial protocol、家具资产、背景、碰撞和 scoring targets；
- Run 41 专属 batch、manifest、task files、scoring reference 和 persistent package；
- 受约束的 Williams sequence matrix；
- 中英文 Run 41 experiment configs；
- 自包含静态资源闭包检查；
- 中文和英文本地预览、自动化测试和浏览器验收；
- 源码和本地生成结果的 focused Git commits。

### 本阶段不包含

- 推送静态网页仓库；
- 修改 VPS、assignment sequence、receiver 环境或数据库；
- 删除或归档旧静态包、旧任务和历史数据；
- 修改 renderer、教程、红光、放大镜、Pause、碰撞或结果保存协议；
- 使用 `preview_10s` 或任何十秒预览流程；
- 重新建模或修改 `References` 原始资料。

## 输入与 canonical 数据流

Run 41 的 inventory 只决定“选哪些刺激、哪些 presentation 重复”。它不能单独作为正确答案表。

```text
Run 41 manifest / inventory
        │ row_index + combination_id + repeat metadata
        ▼
E:/260917/data.csv                 (read-only canonical protocol/source rows)
        │ metric_trial_protocol_json
        │ metric_scene_state_json
        │ metric_object_assets_json
        │ metric_background_assets_json
        ▼
Run 41 BatchConfig
        │
        ├── compileBatch(referenceMode="persistent")
        ├── scoring/scoring-reference.json
        ├── schedule.json
        └── self-contained runtime package
```

输入适配器必须验证：

- 每个 Run 41 row index 在 source CSV 中恰好出现一次；
- combination ID、image path、image hash 和 selection rank 一致；
- 每个正式 task 的 canonical target 来自 source protocol，而不是 review 图片或 inventory 推断；
- 重复 presentation 复用同一 canonical task 定义，不复制或改写 scoring target；
- 所有源文件均以只读方式访问，任何不一致都停止生成。

## Task 与 package 身份

Run 41 使用全新身份，避免和 Run 37、R12 或历史结果混淆。最终名称由实现前的输入确认锁定，暂定如下：

| Artifact | Provisional value |
|---|---|
| Experiment ID | `run_41_persistent` |
| Formal package | `layout-task-run41-persistent` |
| Schedule version | `run41-williams-repeat-constrained-v1` |
| Scoring version | `run41-scoring-v1` |
| Filename prefix | `run-41-persistent` |
| Reference mode | `persistent` |

这些值只能在 Run 41 输入门通过后确定；不能因为复用 Run 37 文件名而继续使用 `run_37_native25_persistent`。

## Sequence 设计

### 基础矩阵

sequence 先对“唯一 task IDs”生成 Williams first-order base matrix：

- 每个基础 sequence 包含每个唯一 task 恰好一次；
- 使用当前 generator 已支持的确定性 Williams 模式；
- 使用固定输入顺序和固定算法，不引入不可复现的随机数；
- 继续验证完整基础矩阵的预期一阶相邻关系；
- 重复 presentation 作为受约束的 overlay 加入，不改变 canonical task ID。

如果最终输入是 23 个唯一刺激加两个重复 presentation，则每条 sequence 为 25 次 presentation，基础 Williams 矩阵为 46 条 sequence。若输入确认的唯一刺激数不同，数量以输入快照为准，不能硬编码为 25 或 50。

### 重复与不相邻约束

对用户确认的两个 repeat task IDs，生成器对每条最终 sequence 验证：

1. 每个 repeat task 恰好出现两次；
2. 两个 repeat task 的任意出现不能形成 `A → B` 或 `B → A` 的相邻关系；
3. 同一 repeat task 的两次出现不能相邻；
4. 其他唯一 task 仍各出现一次；
5. presentation 总数与 inventory 一致；
6. sequence 中的 `trialIndex`、`trialTotal`、`presentationId` 和 repeat metadata 完整且唯一。

这里的“不相邻”是最终 presentation 序列上的硬约束，不是只检查插入位置，也不是只检查两个新增副本。

如果不存在满足条件的插入位置，生成器必须抛出明确错误并停止，不能退化为允许相邻、减少重复或更换随机种子后静默继续。

### schedule metadata

重复 presentation 使用现有 metadata 语义：

- `repeatGroupId`：canonical task ID；
- `repeatIndex=1/2`：该 task 在当前 sequence 中的出现次序；
- `repeatOfTaskId`：第二次出现指回自身 task ID，第一次为 `null`；
- 每个 presentation 有独立 `presentationId`。

## Persistent 条件

Run 41 的所有 batch、task 和 experiment config 必须使用：

```json
{
  "reference_mode": "persistent",
  "flow": { "mode": "direct_reconstruction" }
}
```

必须添加配置和构建检查，阻止以下错误：

- Run 41 config 出现 `preview_10s`；
- Run 41 task 继承 `preview_then_reconstruct`；
- Run 41 生成十秒倒计时、Start preview 或自动隐藏参考图；
- Run 41 配置引用 Run 37/R12 的 experiment ID、schedule 或 scoring reference。

## Bilingual 配置

新增独立配置：

- `public/experiment/experiment-run41-zh.json`；
- `public/experiment/experiment-run41-en.json`。

两份配置必须共享：

- 相同 experiment ID；
- 相同 package、schedule、schedule version 和 scoring reference；
- 相同 task ID 集合与顺序；
- 相同 persistent mode、receiver 配置和 reward 规则。

只允许 locale 和语言文字不同。当前默认入口配置不在本阶段切换，避免用户未验收时影响现有实验。

## 自包含 package 合同

Run 41 本地 release candidate 必须包含所有实际运行所需的：

- HTML、JS、CSS；
- application icons；
- tutorial assets；
- background assets；
- object SVG 和 collision SVG；
- stimulus images；
- task configs；
- manifest、schedule、scoring reference、generation report；
- 不依赖 `E:\260917` 或其他本机绝对路径的引用。

验证器递归解析所有 JSON 声明的文件路径，并拒绝：

- 缺失文件；
- 绝对源路径；
- 包外路径；
- 未复制的图标、教程素材或刺激图片；
- 嵌套 `dist`；
- 旧包路径被 Run 41 formal config 继续引用。

## 测试与验收门

### Gate A：输入快照

- Run 41 manifest 与用户要求的重复数量一致；
- row、combination、图片哈希、source protocol 一一对应；
- 输入 manifest、source hash 和重复身份记录完成；
- 旧 Run 37/R12 包哈希未变化。

### Gate B：生成与 schema

- batch schema 通过；
- task 数量、唯一 ID、QID、对象和 target 通过；
- scoring reference 与 task ID 一一对应；
- schedule 的所有重复和不相邻断言通过；
- Run 41 无 `preview_10s`。

### Gate C：资源闭包

- 所有 declared asset 都能从本地 package 解析；
- 自包含 package 不依赖源目录；
- 中英文配置指向同一 package 和 schedule；
- 图标和教程素材没有漏复制。

### Gate D：本地浏览器验收

中文和英文分别启动本地页面，验证：

- 参考图位于平面图上方；
- 没有十秒预览倒计时；
- 正式 task 使用 Run 41 package；
- 第一项 task、重复 task 和最后一项 task 均能加载；
- 编辑、置信度、保存和提交流程不改变；
- 没有 404 或网络资源失败；
- task 顺序来自新 schedule，而不是 participant number 或旧 schedule。

### Gate E：用户确认

本地中英文页面展示给用户，用户明确确认后才进入部署计划。部署阶段另行执行：静态仓库发布、VPS sequence 更新和线上验证不属于本设计阶段。

## 回滚与数据安全

- 旧静态包、旧 source package、旧 scoring reference、旧配置和历史 receiver 数据均保留；
- 本地生成使用新目录和新身份，不覆盖旧 package；
- 在用户确认前不改默认入口、不改 VPS、不清理数据；
- 若本地验收失败，只删除或重建新的 staging 目录，不触碰旧资产；
- 后续部署回滚只需恢复旧静态入口和旧 VPS 配置，不需要改写历史结果。

## 明确不做的事情

- 不把 Run 42 自动当作 Run 41；
- 不从 review 图片反推答案；
- 不用十秒模式代替 persistent；
- 不为重复刺激新增第二套 scoring target；
- 不为了满足 sequence 而修改任务正确答案；
- 不在本阶段推送静态仓库或更新 VPS；
- 不重构无关的 Player、教程或 receiver 代码。

## 通过标准

只有同时满足以下条件，Run 41 本地迁移才算完成：

1. 输入门确认了实际重复刺激身份；
2. Run 41 task、asset、答案和 scoring reference 完整对应；
3. 每条 sequence 都通过两个重复刺激不相邻检查；
4. 中英文 config 完全共享 task/schedule/package 身份；
5. package 完全自包含且没有十秒模式；
6. 本地中文和英文浏览器验收通过；
7. 用户确认本地页面；
8. 旧版本和历史数据没有被修改。
