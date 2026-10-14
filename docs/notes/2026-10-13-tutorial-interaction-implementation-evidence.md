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

## 2026-10-14：本地预览反馈修正

本次从 `794df79` 后的本地工作树继续实施，包含用户的三项预览修正和随后明确的全页面放大镜滚轮要求：

1. 家具参考板两框可按住左键拖动并同时滚轮缩放，默认 1×、范围 1×–4×、每次 0.25×；松开后不再缩放框内素材。每页/每框位置和倍率独立保留，缩小时限制平移边界，继续拖动不跳变。沿用背景 SVG `contain` 与本地手形图标，不新增素材依赖。
2. 四页家具参考板先于观察方向箭头。箭头仅在参考板完成后显示，确认后立即消失；两种 reference mode 和不配置参考板的回退均有测试。
3. 放大镜倍率及 ESC 提示位于圆形镜片外正下方，两行显示；内部放大场景仍保持圆形裁切。
4. 主放大镜启用后，无需按住鼠标左键，鼠标位于页面任何位置时滚轮都调节平面图镜片倍率。删除 renderer 的事件目标必须属于主 SVG 的限制，保留启用状态检查、阻止页面同时滚动及 ESC 退出。退出后恢复原滚轮行为，不改变其他内容的缩放或编辑状态。

修改路径：`src/core/tutorial-reference-board.ts`、`src/core/tutorial-controller.ts`、`src/core/renderer.ts`、`src/styles/layout-task.css`；对应 controller/board/renderer/player 测试和现有浏览器回归工具同步修改。当前 spec、计划与讨论笔记已更新；历史批次记录不改写。

### 测试与发布包证据

先对顺序和参考板缩放新增失败测试，再实现；全页面滚轮修复前，renderer 回归中五个检查确实失败（预期倍率 2.25，实际 2）。删除目标限制后，renderer 和 magnifier 相关 64/64 检查通过。

初次三项修正的独立证据保留于 `output/playwright/tutorial-followup-20261014/`：67 文件/735 测试、构建、闭包校验及双语 Chromium/WebKit 检查均通过。

全页面滚轮修复第一轮重新验证，未沿用旧通过结果（尚未包含后续审查的两个边缘修正）：

- `npm test`：退出 0，67 文件、739 测试通过。process-local `PYTHON` 指向现有运行时，不改系统配置。
- `npm run build`：退出 0，100 模块构建完成；`npm run validate:web-release`：退出 0，`ok: true`、无失败。
- 从当前源码重新构建的中文/英文独立静态包各 151 文件、无 `.git`，两种语言包的递归素材闭包、runtime 和教程锁校验均退出 0。
- `node tools/browser/tutorial-regression.cjs chromium` 与 `webkit`：各自退出 0；每个引擎均完成两种语言真实入口流程、36 组入口检查、12 个参考板尺寸检查和 6 个宽高比像素检查。
- 新增浏览器交互覆盖：放大镜模式中松开所有鼠标按钮，分别悬停 SVG 家具、透视参考图、教程泡泡、放大镜按钮及页面空白处，实际滚轮均改变镜片倍率；各元素上的滚轮不同时滚动页面，ESC 后正常退出。仍检查家具/保存输入冻结、教程门槛、两种箭头生命周期、同意/年龄/眼镜和首个正式场景。
- 所有必要的同源素材请求成功，无 404、应用控制台错误或未捕获异常。外部源及非读取请求被阻断，不产生生产编号分配或上传。

该轮证据目录：`output/playwright/tutorial-wheel-global-20261014/`。

- 全量测试：`npm-test.log`；构建：`npm-build.log`；发布校验：`npm-validate.log`。
- 静态包构建：`packages-build.log`；包索引：`packages/packages.json`；各语言校验：`packages/zh-validate.log`、`packages/en-validate.log`。
- 浏览器日志：`browser-chromium.log`、`browser-webkit.log`；截图/入口结果：`packages-browser/{chromium,webkit}/{zh,en}/`。
- 已人工查看 Chromium English 的 `magnifier-max.png`，确认两行提示位于镜片外下方。

### 本地验收与发布边界

新包预览继续使用中文 `http://127.0.0.1:5187/?debug=1` 和英文 `http://127.0.0.1:5188/?debug=1`；现有已加载页面需刷新才能载入新 JS。两个入口使用本地 copy-mode，不连接生产 receiver。未推送源分支、静态网页仓库或修改 VPS/WebDAV/历史数据，等待用户本地验收。

实体 Safari 尚未测试；浏览器流程仍只进入第一个正式场景，没有逐一完成全部 23 个正式场景。23 场景素材由发布包校验覆盖；不能将此表述为完整的 23 题浏览器实验。

### 独立审查、修复及最终验证

独立审查发现外部倍率/ESC 提示在视口底部可能不可见，以及参考框同时按左右键后先松左键时可能残留拖动状态。两项均以失败测试复现：镜片 top 为 380px、预期 324px；左键释放后的参考框倍率为 1.25×、预期保持 1×。按实际提示高度及 8px 间距约束镜片显示位置，不改变场景采样；参考框在左键位消失时结束拖动并释放指针捕获。修复后 renderer/board 相关 78 项检查通过，限定独立复审结论为两项已关闭、无新的 Critical/Important/Minor 问题。

只读模式曾阻断最终构建，未将该次拒绝计为已执行；用户随后明确授权继续 change，并要求仅更新本地预览和本地提交，不部署。

最终树重新验证结果：

- `npm test`：退出 0，67 文件、741 测试通过。
- `npm run build`、`npm run validate:web-release`：退出 0，100 模块构建，素材闭包无失败。
- 最新中文/英文独立包各 151 文件、无 `.git`，各语言校验退出 0。
- Chromium 与 WebKit 浏览器回归分别退出 0；每个引擎均完成 2 个真实双语入口、36 组入口检查、12 个参考板尺寸检查和 6 个宽高比像素检查。全页面无按键滚轮、ESC、教程顺序和旧功能门槛全部保留。
- 新增垂直视口断言及将平面图底边对齐窗口底部的真实操作；倍率/ESC 提示在圆圈外下方且不出屏，采样仍保持原鼠标所指的场景位置。已查看 Chromium English 的 `magnifier-bottom-edge.png`。
- 没有必要素材请求失败、404、应用控制台错误或未捕获异常；外部源/非读取请求继续阻断，没有生产分配或上传。

最终证据目录：`output/playwright/tutorial-wheel-final-20261014/`。全量测试/构建/校验分别为 `npm-test.log`、`npm-build.log`、`npm-validate.log`；浏览器日志为 `browser-chromium.log`、`browser-webkit.log`；最终包位于 `packages/{zh,en}-package`，包索引及每语言校验均在 `packages/`；浏览器截图和结果位于 `packages-browser/{chromium,webkit}/{zh,en}/`。

实现与测试本地提交：`662b5d4`（`fix: refine tutorial order and magnifier controls`），只含 11 个明确的源码/测试/浏览器工具路径。设计、讨论、计划和最终证据另作本地文档提交，用户无关未跟踪文件未纳入。

两种语言预览仍使用 5187/5188，已切换为最终包；刷新现有页面即可加载最新 JS。保留当前 `release/zh-CN` 分支，不合并、不推送、不创建 PR、不部署；下一步仅为用户验收本地网页。实体 Safari 与完整 23 题浏览器流程仍未测试。

## 2026-10-14：常驻红光、精简编辑提示与 Confirm 剩余计数

本次在 `a6cdd48` 上继续，用户最终明确授权修改、测试、本地预览、分批提交并推送源码 Git；暂不部署静态网页。之前的只读拒绝未计为已执行。本轮没有修改 VPS、receiver、WebDAV、历史数据、素材锁、原始资料、生产配置或 Blender，也没有纳入用户无关未跟踪文件。

### 实现及诊断事实

1. 编辑泡泡只保留独立 Task 段和一句指向右侧灰色操作框/左下两项置信度的正文。中英文按用户确认文案执行，删除原多句控件、保留姿态、悬浮和评分提示。零位移 Save、两项评分、无限次重新编辑及提交门槛不变。
2. Confirm 按当前必要家具组动态显示 `Confirm · 4/4 left` / `Confirm · 剩余 4/4`，成功首次 Save 后才减一，全部保存显示 `Confirm ★`。重复组、重复保存不重复扣减，固定物体不计入；无障碍名称说明首次保存状态。不新增结果字段或第二份完成状态。
3. 原红光已有 pending 状态逻辑，但 4 SVG 单位经世界/camera 缩放后约为 0.1087 屏幕像素；此前类名检查不能证明可见。本轮换算实际 camera 图层的比例，约保持 4 屏幕像素，在参考板结束及 resize 后重测，画布没有可见尺寸时不绑定滤镜。
4. WebKit 的 CSS filter 数值正确仍可能没有实际光晕。页面快照原生 SVG `feDropShadow` 得到 89 个红色变化像素；实际流程同 ID 重绑、清除镜片副本仍为零，新配置滤镜换新 ID 得到 89。原图/镜片有 8 个 pending filter ID 却只有 4 个唯一值；复用现有 `namespaceInlineSvgIds` 在复制图插入前隔离所有 ID/引用后，真实流程通过。该现象支持资源身份/缓存问题，但不证明 WebKit 内部机制。
5. 新的首个正式题原生 Save 检查发现共享 jsPsych root 的教程锁残留会阻断置信度点击。renderer 在 mount/destroy 时只清理自己拥有的两种锁类；不改写插件生命周期或数据。已以挂载回归和实际正式题两项评分/Save 验证。

影响路径：`src/core/renderer.ts`、`src/styles/layout-task.css`、`src/core/tutorial-controller.ts`、对应两个 test 文件及 `tools/browser/tutorial-entry-acceptance.cjs`。无新依赖或图标：星号为文字；浏览器像素分析沿用已有 Playwright/pngjs 运行时。

### 验证与失败记录

先观察四个预期失败（旧双语提示、无 Confirm 数字），再实现。隐藏参考板回归先失败于 blur 4 而非约 153.846；原生滤镜回归与真实 WebKit 像素检查也先失败。第一轮构建发现新增测试 fixture 的 role 被 TypeScript 推断为 string，修正 literal 类型后重新运行全套。未把这些失败或被拒绝的命令称为通过。

中间包及日志（`packages`、`packages-verified`、`packages-native`、`packages-ready`）是诊断阶段，WebKit 曾分别失败于约 0.11 屏幕像素或实际红色变化像素为零；这些包不是最终交付包。忽略目录中的两份 probe 脚本只用于局部复现，不提交、不作为完整实验验收。

最终状态重新运行：

- `npm test`：退出 0，67 文件、745 项通过。日志 `output/playwright/pending-confirm-20261014/npm-test-delivery.log`。
- `npm run build`：退出 0，100 模块；`npm run validate:web-release`：退出 0，`ok: true`、无失败。日志 `npm-build-delivery.log`、`npm-validate-delivery.log`。
- 独立中文、英文包各 151 文件、无 `.git`，各语言闭包/runtime/tutorial-lock 校验退出 0。最终目录为 `output/playwright/pending-confirm-20261014/packages-delivery/{zh,en}-package`，索引和每语言校验在 `packages-delivery/`；构建日志 `packages-build-delivery.log`。
- Chromium 与 WebKit 两条完整命令均退出 0；每引擎 2 个真实入口流程、36 组入口检查、12 个实际参考框尺寸检查、6 个宽高比像素检查。最终日志 `browser-chromium-delivery.log`、`browser-webkit-delivery.log`。
- 浏览器通过原生输入核对两段精简提示、4/4→3/4→2/4→1/4→★、重复保存不减、新正式题重置 4/4、零位移保存、强制 Pause、放大镜全页面无按键滚轮/ESC、ID 隔离、箭头/参考板顺序、同意及年龄/眼镜。所有必要同源素材请求成功，无 404、应用控制台错误或未捕获异常；外部源与非读取请求被阻断，没有生产分配/上传。

真实家具保存前后红色像素变化如下；所有 screenBlur 约为 4，仍要求至少 10 个变化像素，未降低阈值：

| 引擎/语言 | 教程 | 首个正式场景 |
| --- | ---: | ---: |
| Chromium 中文 | 89 | 92 |
| Chromium English | 39 | 31 |
| WebKit 中文 | 89 | 99 |
| WebKit English | 26 | 25 |

最终截图与 `acceptance.json` 在 `output/playwright/pending-confirm-20261014/delivery-browser/{chromium,webkit}/{zh,en}/`。已查看 WebKit English 的 `tutorial-glow-before.png` 与 `tutorial-glow-after.png`，以及英文精简编辑泡泡截图。固定位置、黄色填色不变；红光在 Save 后消失，选中蓝色反馈仍优先。

有限独立复审结论：clone ID/引用隔离、Confirm 计数和双语文案无新的 Critical/Important 问题。审查者未认证浏览器通过；上述通过来自主执行者对最终两条命令的退出值和输出确认，不能用复审替代运行证据。

### 预览、Git 与边界

最新中文预览为 `http://127.0.0.1:5189/?debug=1`，English 为 `http://127.0.0.1:5190/experiment/?debug=1`，都来自最终独立本地 copy-mode 包。旧 5187/5188 服务保留原诊断版本；不要用旧 URL 验收本次效果。最终预览进程由本轮启动并保持运行。

实现/测试本地提交 `33414e6`（`fix: restore persistent glow and count remaining saves`），仅六个明确路径；本节证据、spec、讨论和计划另作文档提交。源码交付目标为 `origin/release/zh-CN`，采用正常快进推送，完成状态以最终远端 ref 查询为准。已检查 Pages workflow 只对 `feature/flow-preview-reconstruct` 的 push 自动触发，本轮源分支推送不触发该部署；未推送 `web-release`，不部署静态仓库、不创建 PR。

实体 Safari 尚未测试；浏览器只进入并真实保存首个正式场景，未完整作答全部 23 个正式场景。23 场景及 92 对象素材由发布闭包/runtime 校验覆盖，不能等同于完整 23 题浏览器实验。
