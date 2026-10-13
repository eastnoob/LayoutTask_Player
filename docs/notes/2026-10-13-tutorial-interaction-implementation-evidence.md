# 教程交互更新：实施证据

日期：2026-10-13（Europe/Berlin）

状态：本地实施与验证完成，等待用户验收本地中英文页面。本文区分实施、测试、本地提交和部署；未获用户验收前不视为已发布。

## 范围与发布边界

设计：`docs/superpowers/specs/2026-10-13-tutorial-interaction-design.md`。
计划：`docs/superpowers/plans/2026-10-13-tutorial-interaction-update.md`。
起点：`297174d808a42bfc82abdf540f5c5ccc5d6be9bc`，本地分支 `release/zh-CN`。

按用户要求分批实现、测试、独立审查和本地提交。最终先展示本地中英文网页，用户验收后才允许推送或部署静态网页包仓库。本轮尚未推送、部署或修改 VPS/WebDAV/生产数据。

原 PDF、References、Blender 场景及无关未跟踪文件保留。Steam Blender 5.2.2 已验证；Blender MCP 未连通，本轮未操作 Blender，网页工作不依赖该连接。

## 分批证据

### 第一批：知情同意与重复文案

提交：`654f8ea`（`fix: reduce consent and repeated task copy`）。

中英文同意页仅保留第一份文件和四项确认；年龄、眼镜流程及阅读门槛保留。新确认记录采用 `informed-consent-2026-10-13-v2`，不生成已删除文件的声明字段；历史 v1 记录仍可读取及导出。删除编辑页重复通用段落，退出报酬说明采用用户确认的双语文案。

测试证据：实现代理运行全套 Vitest，66 个测试文件、641 个测试通过，TypeScript 检查通过。协调代理复跑相关六个文件，81/81 通过。独立任务审查结论：规格符合、代码质量 Approved，无问题。浏览器完整流程、发布包及后续计时功能尚待后续批次验证。

### 第二批：教程顺序及保存门槛

提交：`e89acdf`（`feat: gate tutorial on saved objects and practices`）。参考板移至方向确认后，沿用逐页 5 秒阅读门槛；两个强制练习及所有家具成功保存事实由控制器检查，零移动保存有效，不能通过教程开发快捷键绕过。

实现代理证据：focused 10 文件 165/165；全套 66 文件 647/647；`npx tsc --noEmit`、`git diff --check`、staged diff 检查退出 0。独立审查结论：规格符合、质量 Approved，无问题。实际放大镜和 Pause UI 接入属于后续批次，此提交本身尚不能完成整套教程。浏览器、自包含发布包和完整数据链验证继续由后续批次负责。

### 第三批：红光与精炼教程文案

提交：`a8b05bf` 加 `c9a1139`（`feat: show pending furniture and concise tutorial tasks`；`test: cover renderer pending state runtime`）。红光从每题开始标记尚未首次成功保存的可编辑物体，仅成功保存两项置信度后清除，重新编辑不恢复；教程泡泡和开场页中英文文案按已确认版本精炼，并保留 persistent/preview 区分。

测试证据：focused 116/116；全套 66 文件 653/653；`npx tsc --noEmit` 与 `git diff --check` 退出 0。第一次独立审查指出测试仅检查源码字符串；修复轮补充真实 renderer DOM 生命周期测试，限定复审结论为 finding addressed、无新 Critical/Important 问题。浏览器 computed-style 与截图尚待 Task8。

### 第四批：只观察的平面图放大镜

本地提交：`bc4e7a7`（`feat: add observation-only floor-plan magnifier`），11 个明确源码、测试和 CSS 路径。实现默认 2×、1.5×–4×、0.25× 滚轮步进、ESC 退出和焦点恢复；保留编辑上下文，控制层阻断置信度、保存、提交及 Pause。修复默认画布变换和镜片边缘目标几何，并补真实 player 回调测试，验证完成教程练习后仍能重复进入放大镜。

实现代理报告：相关 6 文件 91/91；全套 67 文件 663/663（process-local PYTHON）；`npx tsc --noEmit`、`git diff --check` 和 staged diff 检查退出 0。独立任务审查正在进行，尚未接受本批；计时摘要持久化、浏览器交互和视觉验收仍待后续批次。放大镜/Pause/任务窗口的时间戳均为 Unix epoch 毫秒，后续记录器须沿用此契约。

独立审查发现教程 CSS 拦住平面图指针输入、画布外 Ctrl+滚轮未拦截、ESC 未恢复原编辑焦点。修复提交 `df7d017`（3 个源码/测试/CSS 路径）报告相关 71/71 测试及 4/4 实际中英文 Chromium 输入检查通过；浏览器核验还发现镜片场景宽度被原 stage CSS 覆盖，已一并修复并验证边缘目标坐标。TypeScript/diff 检查退出 0。四项浏览器检查使用真实 player/renderer/CSS，但采用数据 URI 图像，属于输入回归而非完整实验和素材验收。修复后的限定复审尚待完成；全套测试将在最终批次再运行，未将历史 663/663 计为本次修复后结果。

### 第五批：教程 Pause 练习与箭头生命周期

提交：`5059dd1`（`feat: require and guide tutorial pause practice`）。教程 Pause 使用独立练习模式，确认后可手动 Resume 或自动 10 秒 Resume；练习不消耗正式题 Pause 额度。方向箭头在首次确认后消失，Pause 高亮和黄色箭头仅在教程练习阶段出现，正式场景不显示。

最终全量测试已覆盖该批次；浏览器双语流程也验证了取消、确认、恢复、提交门槛和正式题 Pause 状态隔离。

### 第六批：放大镜计时、结果导出与解码器校验

实现提交：`c6a38a7`（`feat: record magnifier timing in task results`）；解码器计数一致性修复：`c318d00`（`fix: validate task-window pause and magnifier timing`）。放大镜次数、总时长和有效时长沿用现有 `layouttask.result.v1` 结果链路；Pause 扣时与放大镜扣时分开，旧结果仍可读取。正式题 Pause 区间先裁剪到任务窗口；证据不足时产生兼容性警告，不把不确定历史当作精确计时。正式 Pause 事件数量与事件区间数量不一致时不再认证精确计时；明确的教程练习零正式 Pause 表示仍保持兼容。

证据：Task 6 窄复审结论为 ACCEPT，原 P1 计数不一致问题已关闭；`tools/decoder/decoder-utils.test.ts` 40/40 通过，相关数据与接收端集成套件在 process-local Python 覆盖下 149/149 通过。

### 第七批：参考图独立拖动与素材闭包

提交：`4814d3a`（`feat: make tutorial reference frames draggable`）。两个 SVG 参考框独立保存拖动位置，边界受限；首次实际移动后隐藏中央手形提示，再次悬浮到中央时提示恢复；点击或按住但不移动不算拖动。沿用仓库内的 `public/experiment/layout-task/assets/icons/hand.svg`，不依赖远端素材。

Task 7 复审无 Critical/Important 问题。Chromium/WebKit 检查覆盖两个参考框、跨页位置恢复、视口边界和素材引用。

### 第八批：双语真实入口、发布包闭包与本地预览

提交：`5831d01`（`test: verify bilingual self-contained tutorial release`）。新增真实 `/experiment/` 入口的双语浏览器回归、递归素材闭包校验、独立静态包准备和本地预览工具。

最终证据：

- `npm test`：退出 0，67 个测试文件、731 个测试通过。
- `npm run build`：退出 0，100 个模块构建完成。
- `npm run validate:web-release`：退出 0，`ok: true`、无失败。
- 中文和 English 独立包各 151 个文件、无 `.git`；各自包校验退出 0。
- Chromium/msedge：2/2 语言流程、36 组入口检查、12 个参考板尺寸检查、6 个宽高比像素检查通过。
- WebKit：同样 2/2 语言流程、36 组入口检查、12 个参考板尺寸检查、6 个宽高比像素检查通过。
- 双语流程覆盖同意页、年龄/眼镜、教程阅读与箭头、参考图拖动、放大镜滚轮与 ESC、零位移首次保存、红光清除、Pause 练习、剩余物体门槛、教程提交和首个正式场景。

证据目录：

- 包索引：`output/playwright/task8-stable-20261014/packages/packages.json`
- 中文包：`output/playwright/task8-stable-20261014/packages/zh-package`
- English 包：`output/playwright/task8-stable-20261014/packages/en-package`
- 浏览器证据：`output/playwright/task8-final-20261014/browser-chromium`、`output/playwright/task8-final-20261014/browser-webkit`
- 全量测试日志：`output/playwright/task8-final-20261014/npm-test-stable.log`
- 构建日志：`output/playwright/task8-final-20261014/npm-build-stable.log`
- 发布包校验日志：`output/playwright/task8-final-20261014/npm-validate-web-release-stable.log`

发布边界：本批只生成和验证本地自包含包，没有推送源分支、静态仓库、VPS、WebDAV、坚果云或 Sciebo，也没有产生生产 receiver 请求或实验数据。

## 浏览器和静态包

素材基线和最终包均已验证：源码 R12 persistent 包包含 23 个正式任务、92 个可编辑物体；最终中文/英文包均通过递归引用闭包与教程锁哈希检查。包内 `hand.svg` 已随包复制，未使用远端素材。

预览环境：两个独立静态包服务正在运行：

- 中文：[http://127.0.0.1:5187/?debug=1](http://127.0.0.1:5187/?debug=1)
- English：[http://127.0.0.1:5188/?debug=1](http://127.0.0.1:5188/?debug=1)

Chromium 使用本机 Edge；自动化 WebKit 2336 已通过完整的本地双语入口回归。两个入口均使用 local copy-mode 配置，不向生产 receiver 分配编号或上传数据。

现有 debug 配置仍连接生产 receiver，不能直接用于用户验收。后续验收采用本地 copy-mode 配置，自动化阻断远端 receiver/assignment 请求，不消耗生产编号或上传测试数据。

实体 Safari 尚未测试。WebKit 自动化结果将单独记录，不等同于用户设备上的 Safari。

## Git 与语言分支

英文源分支的旧 checkout 落后于当前 R12 素材和数据关联修复。不得用其旧素材覆盖当前已验证素材；双语构建、入口语言和引用闭包需单独核对。用户验收前不推送任一源分支或静态分支。

## 实施裁决

1. 第二批允许为方向确认后展示参考板修改 runner/plugin 装配，范围以已批准设计为准。若裁决有误，代价为少量接线返工。
2. 继续当前 `release/zh-CN` checkout，保留英文 checkout 和用户未跟踪文件；采用明确路径 staging，禁止发布。代价为隔离较少。
3. 第三批允许同时删除 runner 教程开场 header/body 重复任务文字，以已批准设计第 1.1/8 节为准。若裁决有误，代价为少量文案及测试返工，不改变导航或报酬。
4. 第四/五批允许按需补充 completion/Pause 控制层守卫及 runner/plugin 装配和覆盖测试，以满足正式题放大镜输入阻断及独立教程暂停。当前 runner 只接入正式 Pause 并禁用教程 Pause；采用最小接线，保留正式计时口径。若裁决有误，代价为少量守卫或装配返工。

## 已知限制与待办

- 尚未在实体 Safari 上测试；WebKit 结果是 Safari 引擎近似覆盖，不能替代实体 Safari。
- 浏览器流程只进入首个正式 R12 场景，未在浏览器中完整执行 23 个正式场景；23 个场景及 92 个对象已由发布包和运行时校验器检查，结果链路由全套解码器/集成测试覆盖。
- 当前只等待用户验收上面两个本地页面。用户确认页面无问题后，才执行静态网页仓库的中文 `main` 和英文 `en-US` 发布步骤。
