# Run 41 刺激池迁移实施计划

> 本计划只覆盖本地 LayoutTask。静态网页仓库发布和 VPS 更新是后续独立阶段，必须在本地中英文页面经用户验收后才允许开始。

**Spec:** `docs/superpowers/specs/2026-10-26-run41-stimulus-migration-design.md`

## 全局约束

- 不使用 `preview_10s`；Run 41 全部使用 `reference_mode: "persistent"`。
- 不修改 `public/experiment/experiment.json` 或其他当前默认入口配置。
- 不覆盖 Run 37/R12 package、旧 schedule、旧 scoring reference、`References` 或历史数据。
- 不修改 VPS、静态网页仓库、receiver 数据库或 archive 配置。
- `E:\260917\data.csv`、`E:\260917\sample\run_37\native_23` 和 Run 41 inventory 均视为只读输入。
- 实现开始前必须在隔离分支/工作树中进行；当前工作区的未提交 Run 37 修改不得被清理或覆盖。
- 如果 Run 41 输入无法证明有两个 distinct repeat task IDs，停止，不生成 package 或 schedule。

## 暂定身份

在输入门通过后锁定：

```text
experiment_id:   run_41_persistent
package:         layout-task-run41-persistent
schedule_version: run41-williams-repeat-constrained-v1
scoring_version: run41-scoring-v1
filename_prefix: run-41-persistent
reference_mode:  persistent
```

如果输入实际是单重复或其他数量，先更新 spec/身份，再继续；不得在代码里隐式兼容两种实验定义。

---

## Task 0：创建隔离工作区并冻结输入事实

**涉及：**

- 只读检查：`E:\260917\sample\run_41_repeat1_24presentations`
- 只读检查：`E:\260917\sample\run_42_repeat2_25presentations`
- 只读检查：`E:\260917\sample\run_37\native_23`
- 只读检查：`E:\260917\data.csv`
- 新增：`docs/releases/run41-input-manifest.json`

步骤：

- [ ] 从当前基线创建 Run 41 隔离分支/工作树，保留当前工作区未提交修改。
- [ ] 读取 Run 41 manifest、inventory 和 repeat manifest，计算文件 SHA-256。
- [ ] 对照 source run 的 row index、combination ID、图片 hash 和 selection rank。
- [ ] 明确记录当前 Run 41 实际是一个重复身份还是两个重复身份。
- [ ] 若与用户要求的两个重复刺激不一致，停止并向用户报告，不进入 Task 1。
- [ ] 只有门通过后，锁定 experiment/package/schedule/scoring 身份。

验收：输入快照可复现，且重复身份和最终 presentation 数量没有歧义。

## Task 1：实现 Run 41 输入适配器

**涉及：**

- 新增：`tools/generator/run41-input.ts`
- 新增：`tools/generator/run41-input.test.ts`
- 复用：`tools/generator/run37-native25-input.ts` 中的 CSV、hash、source-row 校验模式

接口目标：

```ts
readRun41Selection(inputRoot: string): Promise<Run41Selection>
```

步骤：

- [ ] 先写失败测试：唯一刺激数量、重复身份数量、source row 一一对应、图片哈希一致、重复 metadata 完整。
- [ ] 将 Run 41 inventory 映射到 `E:\260917\data.csv` 的 canonical source rows。
- [ ] 复用 Run 37/native_23 的 furniture records、scene state 和 protocol JSON，但不复制错误答案或从图片推断答案。
- [ ] 对每个唯一刺激保留一份 canonical task source；重复 presentation 只保存 presentation-level metadata。
- [ ] 对绝对路径、缺失 row、重复 combination ID、hash 不一致、重复 task ID 抛出明确错误。
- [ ] 输出输入 manifest，记录源文件哈希、row IDs、combination IDs、图片哈希、重复身份和计数。

测试：

```powershell
npx vitest run tools/generator/run41-input.test.ts
```

## Task 2：实现 Run 41 batch 与 scoring 映射

**涉及：**

- 新增：`tools/generator/build-run41-batch.ts`
- 新增：`tools/generator/build-run41-batch.test.ts`
- 参考：`tools/generator/build-run37-native25-batch.ts`
- 复用：`protocol/adaptor/assemble-stimuli-csv.ts`

步骤：

- [ ] 先写失败测试：每个唯一 task 有 protocol-derived objects、background、display image、relative target 和唯一 QID。
- [ ] 将 Run 41 source row 转换成新的 task ID，例如 `scene_<combination_id>`，并验证唯一性。
- [ ] 保留现有 object roles、groups、collision、behavior 和 Y-axis 处理逻辑。
- [ ] 把 `reference_mode` 相关 batch defaults 固定为 persistent/direct reconstruction。
- [ ] 生成 scoring reference 时只包含 canonical task 一份；重复 presentation 不新增 scoring task。
- [ ] 生成对象库、背景库、行为库时只保留被新 package 实际引用的条目。
- [ ] 通过 schema 验证所有 task 和 scoring target。

测试：

```powershell
npx vitest run tools/generator/build-run41-batch.test.ts src/core/batch-compiler.test.ts
```

## Task 3：增加可验证的 sequence 不相邻约束

**涉及：**

- 修改：`src/types/schedule.ts`（仅在类型缺失时）
- 修改：`src/types/batch.ts`
- 修改：`src/schemas/batch.schema.ts`
- 修改：`src/core/schedule-generator.ts`
- 修改：`src/core/schedule-generator.test.ts`
- 修改：`src/core/batch-compiler.ts`
- 修改：`src/core/batch-compiler.test.ts`

设计：

- 保留现有 legacy schedule 行为，避免旧 R12 package 被重新解释。
- 为显式 Run 41 schedule 增加 repeat groups 和不相邻 pair 的配置路径；不依赖硬编码 R12 task IDs。
- 将重复插入作为“生成 + 验证”一步完成。
- 对每条最终 presentation sequence 检查：A/B 和 B/A 不相邻、A/A 与 B/B 不相邻、每个 task 次数正确。
- 失败即抛错，不随机重试，不减少约束，不替换重复 task。

步骤：

- [ ] 写失败测试：两个 repeat task 的任意方向相邻都应拒绝；同一 repeat task 的两个 occurrence 相邻应拒绝；合法 schedule 应通过。
- [ ] 写失败测试：Run 41 显式 `repeat_groups` 不继承 R12 默认 repeat；旧 batch 没有 schedule block 时仍保持旧行为。
- [ ] 实现最小配置字段和生成器约束，不改动 renderer 或 runtime timeline。
- [ ] 保证每条 presentation 的 `presentationId`、`trialIndex`、`trialTotal` 和 repeat metadata 正确。
- [ ] 验证基础 Williams matrix 的既有平衡属性，另行验证 repeat overlay 的不相邻属性。

测试：

```powershell
npx vitest run src/core/schedule-generator.test.ts src/core/batch-compiler.test.ts
```

## Task 4：编译新的 persistent package

**涉及：**

- 新增本地输入：`tmp/run41/`
- 新增 staging：`tmp/run41-staging/`
- 生成：`public/layout-task-run41-persistent/`
- 生成：`docs/releases/run41-package-manifest.json`
- 复用：`tools/generator/compile-batch.ts`

步骤：

- [ ] 将输入适配器输出到新的 Run 41 authoring directory，不写入旧 Run 37 authoring 目录。
- [ ] 使用 `compileBatchToDirectory(..., referenceMode: "persistent")` 编译。
- [ ] 验证 manifest、task 数量、schedule、scoring reference、generation report 和 asset libraries。
- [ ] 验证实际 presentation 数量与输入 inventory 一致。
- [ ] 验证每个正式 task 的 canonical answer、collision 和 image 引用。
- [ ] 递归解析全部 JSON 路径，拒绝缺失、绝对路径、包外路径、nested dist 和旧 package formal 引用。
- [ ] 扫描 Run 41 生成物，任何 `preview_10s`、`preview_then_reconstruct`、十秒倒计时字段都使构建失败。
- [ ] 只有全部验证通过后，才把 staging 内容复制到新的 public package 目录。

测试：

```powershell
npm test -- --run tools/generator
npm run build
npm run validate:web-release -- dist
```

## Task 5：添加中英文 Run 41 配置

**涉及：**

- 新增：`public/experiment/experiment-run41-zh.json`
- 新增：`public/experiment/experiment-run41-en.json`
- 新增：`src/core/run41-config.test.ts`
- 不修改：当前默认 `experiment.json` 和 `experiment-en.json`

步骤：

- [ ] 先写失败测试：两份配置的 locale、experiment ID、package、schedule version、scoring version、task ID 顺序和 persistent mode。
- [ ] 生成两份配置，formal task IDs 与 manifest 完全一致。
- [ ] 保留当前 receiver/data-save 结构，但使用新的 Run 41 experiment ID 和 filename prefix。
- [ ] 明确设置 `reference_mode: "persistent"`，不继承默认 `preview_10s`。
- [ ] 验证 tutorial package 仍为当前已验收版本，且没有被 Run 41 任务素材覆盖。
- [ ] 通过 config parser 和 package validator。

测试：

```powershell
npx vitest run src/core/run41-config.test.ts
```

## Task 6：确保本地构建和资源复制支持新 package

**涉及：**

- 修改：`tools/generator/copy-web-release-assets.ts`（仅在当前实现硬编码旧 package 时）
- 修改：`tools/generator/copy-web-release-assets.test.ts`
- 修改：`tools/generator/validate-web-release-package.ts`
- 修改：`tools/generator/validate-web-release-package.test.ts`

步骤：

- [ ] 为 selected Run 41 config 增加显式 package root 解析，不依赖旧 R12 package 名称。
- [ ] 测试复制完整应用资源、图标、教程素材、Run 41 stimulus images、SVG、collision 和 JSON。
- [ ] 测试删除一个图标或教程素材时验证器失败，防止再次漏掉素材。
- [ ] 测试 Run 41 config 不依赖旧 package，但旧默认构建路径仍保持兼容。
- [ ] 不在这一步修改静态仓库或默认线上入口。

测试：

```powershell
npx vitest run tools/generator/copy-web-release-assets.test.ts tools/generator/validate-web-release-package.test.ts
```

## Task 7：本地中文/英文浏览器验收

**涉及：**

- 新增或参数化：`tools/browser/run41-acceptance.cjs`
- 生成：`output/playwright/run41/`

验收项目：

- [ ] 中文 Run 41 config 能打开 tutorial 和第一个 formal task。
- [ ] 英文 Run 41 config 能打开 tutorial 和第一个 formal task。
- [ ] 页面使用 persistent：参考图持续可见，没有十秒倒计时或自动隐藏。
- [ ] 第一、重复和最后一个 task 的 image、背景、object assets 都加载成功。
- [ ] 编辑、confidence、save、confirm 流程不改变。
- [ ] schedule 中的 repeat metadata 与不相邻验证结果一致。
- [ ] 所有网络请求成功，没有图标、教程素材、刺激图或 collision 404。
- [ ] 不向 production receiver 发送测试提交；使用现有本地 copy/debug 防护。

建议命令：

```powershell
node tools/browser/run41-acceptance.cjs chromium zh-CN
node tools/browser/run41-acceptance.cjs chromium en-US
node tools/browser/run41-acceptance.cjs webkit zh-CN
node tools/browser/run41-acceptance.cjs webkit en-US
```

## Task 8：用户本地验收门

- [ ] 启动中文本地页面。
- [ ] 启动英文本地页面。
- [ ] 向用户提供两个本地 URL 和 package/schedule identity。
- [ ] 等待用户确认页面、素材、顺序和 persistent 行为。
- [ ] 用户未确认前，不切换默认入口、不推送源码以外的发布物、不部署静态仓库、不更新 VPS。

## Task 9：本地 Git 提交

只有 Task 0–8 通过后：

- [ ] `git diff --check`。
- [ ] 检查 diff 只包含 Run 41 代码、测试、配置、package 和 release manifest；不包含 `References`、旧 package、历史数据或用户无关文件。
- [ ] 分批提交：输入适配与测试；sequence/compiler 与测试；Run 41 package/config；本地验收记录。
- [ ] 不推送静态网页仓库。
- [ ] 不修改 VPS。

## 后续独立部署阶段（本计划不执行）

用户确认本地页面且源码提交完成后，另开部署计划，单独处理：

- 静态网页仓库中英文发布；
- VPS assignment sequence 更新；
- `/health`、`/assign` 和线上资源验证；
- 旧版本回滚值和发布记录。

本阶段不预设部署命令、不猜测 VPS 访问方式，也不触碰历史数据。

## 计划自检

- [x] 明确了 Run 41 输入与当前 manifest 的矛盾，并设置生成前硬门槛。
- [x] 明确了 canonical answer 来源，避免从 review 图片或 inventory 推断答案。
- [x] 明确了重复刺激在最终 presentation 序列上的双向不相邻检查。
- [x] 明确了 persistent mode 和 `preview_10s` 禁止条件。
- [x] 明确了中英文一致性、资源闭包和浏览器验收。
- [x] 明确了本地 LayoutTask 与后续部署的边界。
- [x] 未加入不必要的 UI、数据协议或 receiver 重构。

### 未覆盖的事项

- 未在本阶段确认 Run 41 的最终两个重复刺激身份；Task 0 是阻塞门。
- 未执行代码、未生成 package、未启动本地服务器、未部署、未提交 VPS 修改。
