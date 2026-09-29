# Stimulus Variable and Power Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 生成可复现的刺激变量对位长表、位置/旋转正确性分析和基于模拟的被试数建议。

**Architecture:** 使用现有 TypeScript/Node 工具链建立一个只读分析脚本。脚本读取本地刺激设计和任务包，并读取指定的正式回答 CSV；输出中间长表、变量审计、统计摘要和 power 模拟报告。分析不修改实验运行逻辑、素材、任务包或上传代码。

**Tech Stack:** Node 22、TypeScript、现有 `csv-parse`/`csv-stringify`、Vitest；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-09-29-stimulus-variable-power-analysis-design.md`

## Global Constraints

- 只分析正式 trial，tutorial 不进入正确性模型。
- 不修改 `public/layout-task-tutorial/`、正式任务包、素材、碰撞文件或 DataPipe 逻辑。
- 不把重复 presentation 当作新的独立 scene 或独立 participant。
- 不将相关性或显著性当作唯一变量选择标准。
- 没有正式回答输入时停止生成最终统计结论，并报告缺失路径。

## Review Focus

- 任务和设计表连接错误：由 Task 1 的 23/23 双向匹配测试覆盖。
- 重复场景被错误合并：由 Task 2 的 presentation 唯一键测试覆盖。
- relative/absolute final state 混淆：由 Task 3 的已知 target fixture 测试覆盖。
- 旋转跨 0/360 度计算错误：由 Task 3 的圆周距离测试覆盖。
- 常数/共线变量进入主模型：由 Task 4 的变量审计测试覆盖。

---

### Task 1: 数据源和刺激对位

**Files:**
- Create: `analysis/stimulus-variable-power-analysis.ts`
- Create: `analysis/stimulus-variable-power-analysis.test.ts`

- [ ] **Step 1: Write the failing test**

测试 `loadStimulusDesign()` 和 `matchTasksToDesign()`：23 个 task 与 23 行 `selected_23.csv` 必须全部匹配，缺失或重复组合必须抛错。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run analysis/stimulus-variable-power-analysis.test.ts`
Expected: FAIL，因为分析接口尚未存在。

- [ ] **Step 3: Implement minimal source loading and matching**

实现 `loadStimulusDesign(csvPath)`, `loadTaskIds(taskDir)` 和 `matchTasksToDesign(design, taskIds)`。连接键为去掉 `scene_` 前缀的 `task_id` 与 `combination_id`。

- [ ] **Step 4: Run focused test**

Run the same command. Expected: PASS with `23/23` matches and no duplicate keys.

- [ ] **Step 5: Commit**

```text
git add analysis/stimulus-variable-power-analysis.ts analysis/stimulus-variable-power-analysis.test.ts
git commit -m "analysis: validate stimulus task mapping"
```

### Task 2: 正式回答长表

**Files:**
- Modify: `analysis/stimulus-variable-power-analysis.ts`
- Modify: `analysis/stimulus-variable-power-analysis.test.ts`

- [ ] **Step 1:** 先写测试，确认每行包含 participant、session、trial、task、combination、model、point 和刺激变量；同一 scene 的两次 presentation 必须保留两行而不合并。
- [ ] **Step 2:** 运行测试，预期因 `buildObservationTable()` 不存在而失败。
- [ ] **Step 3:** 实现 `buildObservationTable(rawRows, designRows)`，正式 trial 过滤使用 `trial_type=formal`，按结果对象 ID 提取 M01/M03/M04/M05。
- [ ] **Step 4:** 运行 focused test，确认重复场景独立保存且没有 tutorial 行。
- [ ] **Step 5:** 提交 `analysis: build stimulus-linked observation table`。

### Task 3: 位置和旋转误差

**Files:**
- Modify: `analysis/stimulus-variable-power-analysis.ts`
- Modify: `analysis/stimulus-variable-power-analysis.test.ts`

- [ ] **Step 1:** 先写测试：位置 x/y 误差分别计算；旋转 `0°` 与 `315°` 的距离为 1 步；完全正确只在对应维度全部正确时为 1。
- [ ] **Step 2:** 运行并确认失败。
- [ ] **Step 3:** 实现 `scorePosition()`、`scoreRotation()` 和 `scoreObservation()`，明确支持当前 `relative` final state 与 scoring reference 的 target。
- [ ] **Step 4:** 运行 focused test 并确认边界通过。
- [ ] **Step 5:** 提交 `analysis: separate position and rotation outcomes`。

### Task 4: 核心变量审计

**Files:**
- Modify: `analysis/stimulus-variable-power-analysis.ts`
- Create: `analysis/stimulus-variable-variable-audit.test.ts`

- [ ] **Step 1:** 先写测试，确认核心变量存在；常数列、`audit.*`、重复 `design.*` 不进入主预测集；原始 asymmetric/relationPerspective 被标记为 exploratory。
- [ ] **Step 2:** 运行并确认失败。
- [ ] **Step 3:** 实现 `auditPredictors()`，输出缺失率、唯一值数、相关性/VIF 风险和主/探索/排除分类。
- [ ] **Step 4:** 运行测试并检查 M05 常数变量被正确标记。
- [ ] **Step 5:** 提交 `analysis: audit stimulus predictors`。

### Task 5: 描述性模型摘要

**Files:**
- Modify: `analysis/stimulus-variable-power-analysis.ts`
- Create: `analysis/model-summary.test.ts`

- [ ] **Step 1:** 先写测试，验证位置与旋转摘要独立生成，且报告 participant/scene 聚类单位。
- [ ] **Step 2:** 运行确认失败。
- [ ] **Step 3:** 实现无需新增统计包的可复现描述性摘要：按变量分位数分组，报告均值、误差、完全正确率和样本量；若环境提供模型工具，再生成混合模型输入文件，不在 Node 中伪造 p 值。
- [ ] **Step 4:** 运行 focused tests。
- [ ] **Step 5:** 提交 `analysis: summarize separate accuracy outcomes`。

### Task 6: 模拟 power analysis

**Files:**
- Modify: `analysis/stimulus-variable-power-analysis.ts`
- Create: `analysis/power-simulation.test.ts`

- [ ] **Step 1:** 先写测试，固定 seed，确认相同输入重复运行得到相同 power；候选 N 和重复次数符合 spec。
- [ ] **Step 2:** 运行确认失败。
- [ ] **Step 3:** 实现最小参数模拟：保留 23 场景 × 4 模型结构，按 pilot 误差分布和预设效应范围模拟 N；分别计算位置、旋转及两类 exact outcome 的 power。
- [ ] **Step 4:** 运行 focused test，确认输出包含 80%/90% threshold。
- [ ] **Step 5:** 提交 `analysis: simulate power for position and rotation`。

### Task 7: 报告和最终验证

**Files:**
- Modify: `analysis/stimulus-variable-power-analysis.ts`
- Create: `analysis/README.md`
- Create: `analysis/reports/stimulus-variable-power-analysis.md`

- [ ] **Step 1:** 先写报告生成测试，要求缺少正式 raw CSV 时报告明确停止，不能产生伪统计结论。
- [ ] **Step 2:** 运行确认失败。
- [ ] **Step 3:** 实现 CLI：输入设计 CSV、任务目录、raw CSV、输出目录；生成长表、变量审计、power CSV 和中文 Markdown 报告。
- [ ] **Step 4:** 运行完整分析；若 VPS raw CSV 不在本机，先报告阻塞项，不虚构结果。
- [ ] **Step 5:** 运行：

```text
npm test -- --run
npm run build
git diff --check
```

- [ ] **Step 6:** 使用 `superpowers:verification-before-completion` 检查输入路径、23/23 对位、输出文件和 git diff；提交 `analysis: add stimulus variable power report`。
