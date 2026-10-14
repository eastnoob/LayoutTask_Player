# 教程、待完成提醒与放大镜：完整设计

日期：2026-10-13（Europe/Berlin）

状态：本地实施与验证完成，等待用户验收双语网页。2026-10-14 按用户补充要求调整参考板缩放、教程顺序及放大镜提示位置；人工验收通过前不推送或部署静态网页仓库。各项测试及提交以实施证据和 Git 记录为准。

源码观察基准：`release/zh-CN`，`297174d808a42bfc82abdf540f5c5ccc5d6be9bc`。

讨论依据：`docs/notes/2026-10-13-tutorial-interaction-design-discussion.md`。发布依据：`docs/notes/2026-10-02-release-deployment-memory.md`。

## 1. 目标与完成规则

让参与者明确当前要做什么，看出尚未完成的家具，并通过真实操作学会 Pause 与放大镜。所有修改同时覆盖中文和英文，静态网页包包含全部必要素材。

每个家具组只有一个可编辑物体。完成该物体的条件是进入编辑、选择位置与方向两项置信度并成功 Save。不要求实际移动或旋转；保持原姿态也可回答和保存。保存后可无限次重新编辑，提交仍检查所有必答家具组及当前未保存回答。

本轮采用路径 A：沿用现有控制器和保存门槛，增加最小放大镜状态层。按用户补充要求缩减入口文档，保留第一份知情同意书、适用的阅读/滚动要求、年龄、眼镜及入口流程。实验条件、生产分配、VPS/WebDAV 历史数据和 Blender 建模不属于本设计。

### 1.1 入口文档与教程开场的补充要求

**入口只保留第一份文件的内容。** 当前页面不是嵌入两个 PDF，而是在 `src/core/experiment-consent.ts` 中将其内容合并成中英文 HTML。第一部分为知情同意书，第二部分从 `Data protection policy in accordance with Art. 13 GDPR` / `依据《通用数据保护条例》第 13 条的数据保护声明` 标题开始，直到该文件的同意声明及监护人说明结束。删除第二部分的全部网页文本；第一部分自身的 Privacy/隐私、研究流程、风险、时长、报酬、退出与联系方式保留。源码附近的原文件为 `D:/PROJECTS/web/LayoutTask/繁文缛节/consent_form_en.pdf` 和 `data_protection_en.pdf`；本轮修改网页内容，不删除或改写原 PDF。

同步删除第二份文件专属的第五个勾选项。保留知情同意书的四个确认项，四项均勾选才可继续；更新确认项数量、门槛、无障碍名称及电子签署说明，将“同意两份文件”改为仅确认当前知情同意书。中英文同时修改，第二页年龄与眼镜不受此删减影响。

保存必须与实际展示一致。新记录使用 `consent_version: informed-consent-2026-10-13-v2`，保留四项知情同意确认、语言、时间、签署方式与开发模式标记；不再生成已删除声明的 `notice_version` 或 `data_protection_statement_confirmed: true`。旧版本记录及其字段继续可读，不重写历史数据。既有 CSV 列保留，新的两项声明字段留空；JSON、session、本地备份与现有导出链路不能补回旧声明或其确认。该版本号区分网页确认范围，不修改 PDF 内的修订版本。

**教程开场同一任务只说明一次。** 已定位 `src/experiment-runner.ts::buildExperimentTimeline()` 的 `tutorial_intro` 页面：header 的 `layout-task-meta` 和正文第一个加粗段落均说明观察页面上方图片、在下方平面图还原家具，正文下一段又复述完整流程。保留页面标题、一个独立的 `Your task:` / `你的任务：` 段及一条简短的教程流程说明；删除重复的 header 描述，不再在正文重复看图任务。保留“开始教程 / Start tutorial”按钮及页面导航行为。具体双语稿见第 8 节；后续 player 的模式说明仍负责解释常驻或 10 秒预览规则。

**所有场景的编辑页都删除重复的整段通用说明。** 删除 `instruction_edit_mode` 中“图片显示在页面顶部、根据图片还原平面图、选择位置和旋转置信度”的重复文案，不在每个场景/家具编辑页重复展示。任务信息由教程的 `Your task:` / `你的任务：` 段、场景级重建提示、置信度控件标签和 Save 操作说明分别承担；不得因此删除实际任务要求或完成门槛。中英文同步，包含默认消息、中文消息、配置覆盖与相关测试断言。

## 2. 教程顺序与门槛

| 顺序 | 阶段 | 继续条件 |
| --- | --- | --- |
| 1 | 知情同意、人口信息、精简教程开场与参考图说明 | 第一份知情同意书的四项确认及适用的阅读门槛；年龄/眼镜流程保留；按当前 reference mode 显示说明 |
| 2 | 四件家具参考板 | 原有每页 5 秒继续倒计时；拖动及按住时滚轮缩放仅提示，不强制；此阶段不显示方向箭头 |
| 3 | 确认观察方向 | 四页家具参考板完成后显示黄色方向大箭头；点击确认后立即消失 |
| 4 | 放大镜练习 | 同一次使用中进入、滚轮实际改变倍率、ESC 退出 |
| 5 | 选择第一个物体 | 进入一个尚未保存物体的编辑模式 |
| 6 | 位置/方向与两项置信度 | 可调整或保持姿态；两项置信度均选择 |
| 7 | 保存第一个物体 | Save 成功，首次完成状态成立 |
| 8 | Pause 练习 | 点击、确认进入暂停，再手动 Resume 或 10 秒自动恢复 |
| 9 | 其余物体与提交 | 每个必答组已保存两项置信度，所有练习完成，无未保存回答且不处于 Pause 确认/暂停或放大镜模式 |

正文说明可对应现有置信度/保存步骤逐步显示，不强迫移动事件才能进入回答。最终检查在 `CompletionController` 层执行，不能只禁用或隐藏按钮。

放大镜提前 ESC 可重试；只有滚轮导致倍率实际变化才满足练习。取消 Pause 确认不算完成。练习未完成时，即使家具答案齐全，也不能直接提交教程。正式题不重复要求教程练习。

处于放大镜练习阶段时只放行该练习的进入、变倍和退出；处于 Pause 练习阶段时只放行点击 Pause、确认/取消及恢复。相应阶段完成前，家具选择、编辑、保存和最终提交均被阻断，不能先继续编辑下一件家具再补做练习。取消或提前退出仍停留在当前练习阶段，允许重试。

原源码将参考板作为独立 InstructionsPlugin 页面放在 player 前。实施后参考板成为教程内的观察阶段，位于观察方向确认之前，复用页面生成和阅读倒计时；通过 runner/plugin/player 的装配传递所需参考板信息，不重复初始化或提交教程任务。参考板观察期间锁住家具和最终提交。未配置参考板时直接进入观察方向确认；persistent 与 preview 两种模式均沿用这个顺序。

每框拖动状态和缩放倍率保留到离开教程或刷新；如发生页面重渲染/返回应恢复该框的位置和倍率。现有页面不提供向后导航，本设计不为此新增导航。

## 3. 红光、编辑与文字强调

- 每题开始，尚未首次成功保存的可编辑物体显示低调、持续、不闪烁的红色外缘；实际黄色填色不变。
- 红光只表达“尚未完成首次回答并保存”。点开、移动、旋转或选择单项置信度均不清除。
- 首次 Save 成功清除该组红光；重复编辑不恢复。新题独立计算，恢复已有保存结果时以该题的保存状态为准。
- 视觉层与操作/碰撞反馈层分开；编辑选中与瞬时碰撞反馈不能被红光覆盖。红光不改变点击区域、姿态、评分或置信度。
- 每个教程泡泡首先显示独立的 `Your task:` / `你的任务：` 段，沿用醒目的任务样式。
- 只将 `yellow object(s)` / `黄色物体` 词组设为红色加粗，包括任务段中出现的词组；其余文字不整句染红，删除原浅黄描边。

完成状态以 `ConfidenceController` 保存事实为依据，renderer 和教程不各自维护另一份答案完成状态。

## 4. Pause 教程

使用现有 `tutorial_practice` 模式，练习不消耗正式实验一次、最长 15 分钟的 Pause 额度。

第一个物体保存成功后，Pause 按钮高亮并显示黄色箭头。点击后出现教程专用确认；确认才进入 10 秒暂停。暂停界面说明可等自动恢复或点击 Resume，两种恢复均完成练习。完成后立即移除箭头和高亮，正式题不创建这些引导。

最初观察方向大箭头与 Pause 箭头是不同阶段的独立引导。方向箭头确认后不再出现；不能为了 Pause 复用而重新显示方向箭头。

Pause 确认或暂停期间不能启动放大镜；放大镜中不能启动 Pause。现有暂停输入阻断及保存/提交保护继续生效，教程确认/倒计时/Resume 文案同时本地化。

## 5. 放大镜

### 5.1 可见行为

主平面图隐藏 Zoom in、Zoom out、Reset view、Pan view 四个控件及对应旧教程；原工具位置只显示单个放大镜按钮，使用内嵌 SVG 图标。家具参考板的拖动是独立观察功能。

放大镜仅显示当前下方平面图场景；不放大透视参考图、页面工具或泡泡。圆形镜片跟随平面图内鼠标，初始倍率 2×，范围 1.5×–4×，滚轮每次调节 0.25×。进入模式后，无需按住鼠标左键，鼠标位于页面任何位置（包括 SVG 家具、参考图、工具、提示及空白处）时滚轮都调节该平面图镜片倍率，不能同时滚动页面或改变家具。ESC 退出后滚轮恢复原行为；页面上其他内容不会被镜片放大。

镜片默认直径约 220 CSS 像素，小画布自适应缩小。进入时先置于平面图中心；鼠标进入画布后跟随。接近边缘时镜片显示位置向内调整，放大目标仍是鼠标指向的场景位置，不能因位置限制改看另一区域。

倍率和“按 ESC 退出放大镜 / Press ESC to exit”显示在圆形镜片外、正下方的清晰提示条中，两行分别显示倍率/范围和 ESC 说明，整个模式持续可见。到达上下限显示“最小 / 最大 / Min / Max”。圆形场景保持裁切；外部提示不受圆形遮罩裁切，也不得被画布边缘裁切。

镜片显示位置同时预留提示高度和下方间距，确保提示不落到视口底部之外；只调整显示位置，不改变鼠标所指的场景采样位置。

鼠标离开平面图时，镜片停在最后有效位置；模式、输入冻结与使用计时持续，直到 ESC 退出。没有退出按钮。

### 5.2 输入与状态

正常任务阶段可进入放大镜，包括正在编辑物体时。保留当前选择、姿态和未保存置信度；退出后恢复原编辑上下文，不自动保存、重置或退出编辑。

模式期间只接受镜片鼠标跟随、倍率滚轮与 ESC。家具点击/拖动、移动/旋转按钮、置信度选择、Save、最终提交、Pause 和编辑快捷键均被阻断；通过控制器调用也不能绕过状态检查。ESC 被放大镜消费，不能同一次事件再退出家具编辑。

放大镜按钮沿用原工具的键盘可达性与本地化名称；模式中的键盘激活也不能绕过输入阻断。进入时确保 ESC 能被当前模式接收，退出时恢复原控件焦点，不丢失未保存编辑。

放大镜与 Pause 确认/暂停互斥；提交完成后的锁定状态及前置教程观察阶段不能启动放大镜。教程练习完成后，在正常编辑中仍可重复使用。

最小 `MagnifierController` 管理模式、倍率、输入与使用区间，renderer 管理镜片视觉。任务销毁时清除事件与镜片，不把状态带到下一题。

## 6. 家具参考板拖动与按住缩放

每件家具的“全部家具”和“可移动家具”两个 SVG 框分别支持按住鼠标左键拖动观察；按住时可同时使用滚轮缩放，默认 1×，范围 1×–4×，每次 0.25×。松开后滚轮恢复页面滚动，不继续缩放。只变换框内图像，不改变素材、家具状态或三维动画。

保持当前 SVG 背景图的 `contain` 适配，平移并缩放内部图像层；不要改回已发生旧 WebKit 裁切的百分比 `<img>`。容器裁切溢出，平移边界随倍率调整；缩小时将位置夹回新边界，继续拖动不跳变。拖动后保留位置及倍率，不自动复位、不增加缩放或复位按钮。

复用现有本地 `hand.svg`，半透明居中，不拦截拖动。各框未拖动时默认显示；中央悬浮显示、离开中央隐藏。首次实际拖动后默认隐藏，再次中央悬浮仍显示。中央提示区域以图标及其提示容器为准，不把全框悬浮当作中央悬浮。单击或按住未移动不算拖动。

各框分别维护拖动状态、位置和倍率，在教程内按参考页/家具及框类型关联；两框及四页互不影响。观察状态不写入实验答案，不额外采集拖动轨迹或倍率日志。中央固定提示为“按住拖动观察 / Click and hold to drag”；参考板正文同时说明按住时滚轮缩放。

## 7. 时间与结果数据

| 字段 | 口径 |
| --- | --- |
| `page_timing.total_elapsed_ms` | 原页面墙钟总时间，保留原语义 |
| `page_timing.player_elapsed_ms` | player 启动到提交的任务墙钟时长，包含 Pause/放大镜 |
| `duration_ms` | 原任务时长，只扣除 Pause |
| `page_timing.active_player_elapsed_ms` | 原口径，只扣除 Pause |
| `magnifier.use_count` | 当前任务成功进入放大镜的次数 |
| `magnifier.total_duration_ms` | 当前任务放大镜累计使用时长 |
| `effective_duration_ms` | `duration_ms - magnifier.total_duration_ms` |
| `page_timing.effective_player_elapsed_ms` | page timing 开启时，相应扣除 Pause 和放大镜的有效任务时长 |

成功进入计一次；滚轮、鼠标移动、重复点击不计新一次。立即 ESC 或练习不达标也记录真实使用。区间只计算与当前任务窗口的重叠部分；Pause 与放大镜不重叠，不重复扣除。教程和各正式题独立统计。

根级摘要与有效时长不依赖 `record_page_timing`。新版未使用时写 `{ use_count: 0, total_duration_ms: 0 }`。计数为非负整数，时长为非负有限数；不能写负有效时长，错误计时须在验证中暴露。

是否使用由 `use_count > 0` 推导。JSON 不重复布尔字段；CSV 可提供 `magnifier_used`、计数、累计时长和有效时长。旧结果缺字段表示未采集，CSV 留空，不能伪造为零。

保留 `layouttask.result.v1`，新增字段 optional。full 和 final-only 都保留摘要；原操作事件 `t` 保持已扣除 Pause 的旧时钟。新摘要与答案同在一条任务结果中，走现有编码、提交、本地备份及归档；保持 participant/session/task/trial 关联，不新建计时文件。

不采集镜片鼠标轨迹、逐帧画面或每次倍率日志；区间只在控制器内部用于计时。参考板移到教程任务内后，其阅读时间属于该 player 窗口的总时长，不伪装成放大镜时间，也不新增扣除项。该装配变化只影响教程计时；新版教程时长包含此前独立的参考板阅读时间，比较历史教程时长时须注意窗口变化，正式题的计时窗口不变。

当前 decoder 将 `duration_ms` 直接与墙钟比较，会误报合法 Pause 结果。修正时按当前任务窗口裁剪已有 Pause 区间后校验，沿用合理容差；新有效时长同时按放大镜摘要校验。旧数据没有足够区间证据时不能假定 Pause 为零而误报，也不能称其精确计时已验证。旧字段继续可读。

示例：墙钟 120 秒，Pause 10 秒，放大镜 20 秒、2 次；`duration_ms = 110000`，`effective_duration_ms = 90000`，`magnifier = { use_count: 2, total_duration_ms: 20000 }`。

## 8. 精炼双语文案

每个 Task 内容在实际泡泡前加 `Your task:` / `你的任务：`，独立段落。正文避免重复当前任务句，保留操作所需信息。下面按 reference mode 区分入口；当前发布的 R12 为 persistent。

| 阶段 | English: Task / Body | 中文：任务 / 正文 |
| --- | --- | --- |
| 教程开场页（player 前） | **Task:** Study the perspective image and reconstruct the furniture positions and orientations on the floor plan. **Body:** The tutorial guides you through editing, confidence ratings, saving, the magnifier, and Pause. | **任务：**观察透视图，尽可能在平面图中还原家具的位置和方向。**正文：**教程将带你练习编辑、置信度评分、保存、放大镜和暂停。 |
| 常驻图入口 | **Task:** Study the perspective image and prepare to reconstruct the floor plan. **Body:** You may refer to the image at any time. Remember each marked item's presence, position, and orientation. | **任务：**观察透视图，准备还原平面图。**正文：**你可以随时查看透视图。请注意每件标记家具是否出现、位置和方向。 |
| 10 秒预览入口（仅该模式） | **Task:** Study the image and prepare to reconstruct the floor plan. **Body:** You have 10 seconds to remember each marked item's presence, position, and orientation. | **任务：**观察参考图，准备还原平面图。**正文：**你有 10 秒记住每件标记家具是否出现、位置和方向。 |
| 预览（仅该模式） | **Task:** Remember the furniture before the image disappears. **Body:** Study the image until the countdown ends. | **任务：**在图片消失前记住家具信息。**正文：**请观察图片，直到倒计时结束。 |
| 家具参考板 | **Task:** Inspect each furniture arrangement. **Body:** Click and hold either floor plan to drag; use the wheel while holding to zoom. Dragging is optional. | **任务：**观察每组家具的摆放。**正文：**按住并拖动平面图，按住时可用滚轮缩放；拖动不是必做项。 |
| 观察方向 | **Task:** Confirm the viewing direction shown by the yellow arrow. **Body:** The observer is at the bottom of the plan. This direction stays fixed throughout the experiment. | **任务：**确认黄色箭头所示的观察方向。**正文：**观察者位于平面图下方；该方向在整个实验中保持不变。 |
| 放大镜练习 | **Task:** Open the magnifier, change its zoom with the wheel, then press ESC to exit. **Body:** It magnifies only the floor plan. Do not enlarge the perspective image with browser zoom, Ctrl+scroll, or another tool; these actions may be recorded. | **任务：**打开放大镜，滚轮调节倍率，再按 ESC 退出。**正文：**放大镜仅用于平面图。请勿用浏览器缩放、Ctrl+滚轮或其他工具放大透视图；这些行为可能会被记录。 |
| 首次选择 | **Task:** Click a glowing yellow object to begin editing. **Body:** Red glow means its first edit has not been saved. Only yellow objects can be edited. | **任务：**点击发红光的黄色物体，开始编辑。**正文：**红光表示尚未保存首次编辑。只有黄色物体可以编辑。 |
| 位置与方向 | **Task:** Match this object's position and orientation to the perspective image. **Body:** Use the move and rotate controls if needed; keeping the current pose is allowed. Move the pointer away to hide the controls and back to show them; you remain in edit mode. | **任务：**使物体位置和方向与透视图一致。**正文：**需要时用控件移动或旋转；也可保留当前姿态。移开鼠标隐藏控件，移回显示；仍处于编辑模式。 |
| 置信度 | **Task:** Rate your confidence in both position and orientation. **Body:** Select a rating for each below. | **任务：**评估你对位置和方向的把握程度。**正文：**请分别选择两项置信度。 |
| 保存 | **Task:** Save both ratings. **Body:** Select Save to finish this edit. The red glow disappears after the first save. | **任务：**保存两项置信度。**正文：**点击 Save 完成本次编辑；首次保存后红光消失。 |
| Pause 练习 | **Task:** Complete the Pause practice. **Body:** Click the highlighted Pause button and confirm. Wait for automatic resume or choose Resume. | **任务：**完成 Pause 练习。**正文：**点击高亮的 Pause 并确认；等待自动恢复，或点击 Resume。 |
| 其余物体 | **Task:** Edit and save each remaining yellow object. **Body:** Save both position and orientation confidence ratings for each one. | **任务：**编辑并保存其余每个黄色物体。**正文：**每个都要保存位置和方向两项置信度。 |
| 提交 | **Task:** Finish all remaining objects, then continue. **Body:** Every yellow object must have both ratings saved at least once. You can reopen any saved object and edit it as often as you like. Select Confirm when all are saved. | **任务：**完成所有剩余物体，然后继续。**正文：**每个黄色物体都必须至少保存两项置信度一次；之后可无限次重新编辑。全部保存后选择 Confirm。 |
| 完成 | **Task:** Tutorial complete. **Body:** Continue to the experiment. | **任务：**教程完成。**正文：**继续进入正式实验。 |

页面与模式界面补充文案：

- 退出/未完成的报酬说明：已定位 `src/experiment-runner.ts` 的教程完成页退出说明，当前英文为 `In that case, you will not receive the promised compensation`，中文为“在这种情况下，您将无法获得承诺报酬”。按用户指定，英文改为独立句 `You may not receive payment as a result of this.`，中文对应“您可能因此无法获得报酬。”；其后关于无处罚、无额外费用和联系研究人员的信息保留。中英文同步，实际奖励计算沿用现有规则。
- 放大镜固定提示位于圆形外正下方，第一行显示 `{倍率}（最小 1.5×，最大 4×）` / `{zoom} (min 1.5×, max 4×)`，第二行显示 `按 ESC 退出放大镜` / `Press ESC to exit`。倍率边界增加 Min/Max。
- 教程 Pause 确认：`暂停练习将持续最多 10 秒，不消耗正式暂停机会。确认开始？` / `This practice pause lasts up to 10 seconds and does not use your formal pause. Start?`
- 教程暂停中：`可等待 {秒数} 秒后自动恢复，或点击 Resume。` / `Wait {seconds} seconds for automatic resume, or select Resume.`
- 练习缺失的提交提示分别指出尚需完成放大镜或 Pause，不只显示笼统错误。通过正常步骤完成即可消除提示。

以上为已确认文案基准及新增开场去重要求的合并稿：保留现有模式差异、悬浮隐藏控件信息和强制练习提示。入口文档仅按第 1.1 节删除第二份数据保护文件的网页内容及对应确认；第一份知情同意书、人口信息和奖励/退出说明保留。

## 9. 文件与职责范围

| 文件/模块 | 修改职责及相关检查 |
| --- | --- |
| `src/core/experiment-consent.ts`、`src/core/experiment-consent.test.ts`、`src/core/bilingual-consent-config.test.ts` | 两种语言仅显示第一份文件、四项勾选及门槛、单份文件签署说明、新旧确认记录兼容 |
| `src/main.ts`、`src/core/experiment-session.ts`、`src/core/experiment-data.ts` 及 session/data 测试 | 检查入口调用、确认记录透传与导出；新记录不伪造第二份文件确认，旧记录继续读取，旧 CSV 列保留且新版留空 |
| `src/core/tutorial-controller.ts` | 新阶段、完成事件、双语 task/body、零位移衔接；教程测试 |
| `src/core/layout-task-player.ts`、`src/plugins/jspsych-layout-task.ts`、`src/experiment-runner.ts` | 放大镜/Pause/参考板装配、生命周期、模式和配置传递；开场页去重、退出报酬文案及 player/plugin/timeline 回归 |
| 新最小 `src/core/magnifier-controller.ts` | 模式、倍率、输入消费、使用区间及独立测试 |
| `src/core/renderer.ts`、`src/styles/layout-task.css` | 红光、镜片、倍率/ESC、工具和词组强调；renderer 与浏览器验证 |
| `src/core/tutorial-reference-board.ts` | 现有 SVG 适配、拖动、提示、每框状态；页面装配与浏览器验证 |
| `src/core/experiment-pause.ts`、`src/core/experiment-pause-ui.ts` | 教程确认、10 秒恢复、引导、练习不消耗额度；Pause 测试 |
| `src/core/confidence-controller.ts`、`src/core/interaction-controller.ts`、`src/core/completion-controller.ts` | 复用保存事实和输入门控；零位移、未保存保护及练习提交门槛 |
| `src/core/recorder.ts`、`src/core/page-timing.ts`、`src/types/result.ts`、`src/schemas/result.schema.ts` | 独立摘要、有效时长、兼容校验 |
| `src/core/encoder.ts`、`src/core/experiment-data.ts`、`tools/decoder/decoder-utils.ts` | 摘要保留、现有任务归档对应、CSV 与 Pause 计时校验；不另建上传协议 |
| `tools/browser/tutorial-regression.*`、必要浏览器流程检查 | 真实交互、中英一致、WebKit 显示与素材请求 |
| `tools/generator/*web-release*`、现有 runtime/tutorial 包检查 | 按需要补足实际引用闭包检查和独立发布包验证 |

只有现有行为确需调整时才修改相关模块；透传新字段已满足的模块以测试证明，不为清单而制造改动。无新图标依赖，无统一状态机重写。

## 10. 验收与证据

本设计列的是验收要求，不作为“已通过”证据；实施结果记录于实施证据文档。

### 10.1 控制器与数据测试

- 中英文入口仅包含第一份文件；其 Privacy/隐私、时长、报酬、风险和退出说明仍在，第二份文件及专属确认不再出现。四项确认缺任一项不能继续，全选四项可继续；签署说明与无障碍名称只指向第一份文件。
- 新确认记录使用 v2，不包含旧声明版本或声明确认；经 session、JSON、本地备份与 CSV 导出后不补回，CSV 对应旧列留空。旧 v1 记录及字段仍可读取并原样导出。
- 教程开场标题、独立 task 段与一条流程说明保留；同页不再分别在 header 和正文重复看图任务，中英文都符合该结构，开始教程及后续导航保留。
- 所有场景/家具编辑页均不再显示 `The picture is shown at the top of the page. Reconstruct the floor plan as closely as possible to the picture, then choose confidence ratings for both position and rotation.` 或对应中文整段；教程任务、重建提示、置信度标签和 Save 说明仍完整存在。
- 教程完成页的退出说明使用指定的 `You may not receive payment as a result of this.` / “您可能因此无法获得报酬。”，该段不再断言退出后一定无法获得报酬；联系信息及无处罚/费用信息保留。
- 零位移进入、两项置信度、Save；漏选/未保存不能提交；首次成功保存才清除红光，重复编辑不恢复，新题独立。
- 放大镜默认/边界倍率、滚轮实际变化、提前退出重试、只开未变倍不能通过；编辑中进入保留姿态和未保存答案，ESC 不连带退出编辑。
- Pause 取消确认不算，确认后手动/自动恢复都算；未完成不能提交，练习不消耗正式额度，高亮与箭头生命周期正确。
- 模式互斥、阻断鼠标/键盘按钮与快捷键及直接完成调用；两项练习和保存检查均在提交入口有效，当前练习阶段不能跳到下一件家具；放大镜 ESC 接收与退出焦点恢复正常。
- 零次、多次、立即退出、区间裁剪、按题隔离、关闭 page timing；墙钟、仅扣 Pause、再扣放大镜三口径符合示例。
- optional 字段旧数据兼容，新版零使用与旧版未采集可区分；full/final-only 编解码保留摘要，CSV 值正确；Pause 后 duration 不误报墙钟不一致。
- 构造完整教程结果与正式题结果，经现有 session/export/local backup 链路后解码，确认新字段和 participant/session/task/trial 身份仍对应；不向生产发送测试参与者结果。

以相关现有 Vitest 测试和新增控制器小测试为主，完成针对性检查后运行 `npm test` 和 `npm run build`。构建同时执行 TypeScript 检查；不能用只发送教程事件的测试代替真实页面操作。

### 10.2 浏览器

中文和英文均在 Chromium 与 WebKit 完成正常入口 → 教程 → 正式任务的真实交互流程，并覆盖正常尺寸与较小支持窗口。测试身份和结果使用本地接收桩/测试副本，不消耗生产编号。

重点检查：仅第一份知情同意内容、四项确认及适用的阅读/滚动门槛、年龄/眼镜、教程开场去重、reference mode 文案、既定教程顺序、Pause 强制练习、放大镜强制练习、物体编辑保存、有效时长及所有模式阻断。保留显示方向箭头与 Pause 箭头的不同生命周期。

视觉证据包含：待完成/已保存红光、编辑中镜片与退出恢复、镜片边缘/离开画布/最小最大倍率、镜片外下方 ESC 提示、四页先于方向箭头、两个参考框独立拖动/按住时缩放及手势悬浮、Safari 曾裁切的家具完整轮廓、两种语言 task 及词组强调。记录失败请求、404 和控制台错误。

WebKit 自动化用于相关显示与交互回归，不能冒充用户设备上的 Safari 测试；若实际 Safari 未测，最终报告须明确。

### 10.3 自包含发布包

中文和英文分别从对应源码生成新鲜 `dist`，不能混用旧构建或增量残留。运行 `npm run validate:web-release`，再复用 runtime/tutorial 验证检查真实配置、manifest、library、场景、图片、GIF、SVG 和图标引用及教程锁。

当前 web-release 检查器主要检查固定路径与 task 文件存在，单独通过不足以证明全部引用闭包。本次应补足或组合现有验证，确保所有实际引用都在最终包内。

复制成独立无 `.git` 的包，从该副本作为静态根加载 `/` 和 `/experiment/`，完成中英教程及正式场景抽查，全部必需素材无失败请求。任何必要素材缺失、教程锁不一致或入口回退均视为验收失败。

根入口必须到 `/experiment/`，使用 R12 persistent。静态仓库根直接放 dist 内容，不能套一层 dist 或发布源码。后续发布覆盖中文 `main` 和英文 `en-US`，并保持对应源码分支一致；实际提交与发布留待实施完成且在用户授权范围内执行。

### 10.4 交付证据

实施报告提供修改路径、测试命令与退出结果、浏览器/包检查报告和截图路径，以及未解决问题。未执行的检查标明未执行；计划勾选、通过测试和实际部署分别陈述。

## 11. 下一步

执行已确认的 `docs/superpowers/plans/2026-10-13-tutorial-interaction-update.md`，分批实现、测试、独立审查和本地提交。完成后先展示本地双语网页供用户验收；用户确认后再进入静态仓库发布步骤。设计同意、测试通过、本地提交与实际部署分别记录，不混为同一状态。
