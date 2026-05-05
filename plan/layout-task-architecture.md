# Layout Task 软件架构方案

版本：v1.0  
目标项目名：Layout Task / layout-task-player  
适用场景：静态部署的网页空间布局实验播放器，可作为 jsPsych 自定义 plugin 或独立页面运行。

## 1. 总体架构

Layout Task Player 是一个纯前端、配置驱动的空间布局任务播放器。系统读取 URL 参数和静态配置文件，解析出某一道布局任务，在 SVG 世界坐标系中渲染底图与可交互对象。被试通过对象旁的控制按钮执行离散移动和旋转，系统记录状态变化、事件日志、显示设备信息，并在二次确认后锁定结果、编码为一行字符串、复制到剪贴板。

核心原则：

- 静态部署：所有配置、素材、脚本均可由 GitHub Pages / GitLab Pages / Netlify 提供。
- 配置驱动：任务、素材、行为规则拆分维护，运行时解析为完整 `RuntimeTaskConfig`。
- 结果可追溯：输出字符串包含 schema 版本、题号、任务 ID、session、hash 和压缩数据。
- jsPsych 友好：播放器核心与 jsPsych plugin wrapper 解耦，既能独立运行，也能作为 timeline trial 使用。
- 交互可扩展：第一版使用按钮式离散移动/旋转，预留自由拖动、边界约束和更多对象类型。

文字架构图：

```text
URL / jsPsych trial params
          |
          v
ConfigLoader ---- ConfigValidator
          |
          v
RuntimeTaskConfig
          |
          v
LayoutTaskPlugin / Standalone App
          |
          +--> Renderer <---- StateStore
          |       ^              |
          |       |              v
          +--> InteractionController --> Recorder
          |                              |
          +--> CompletionController -----+
                         |
                         v
                Encoder / ClipboardService
                         |
                         v
          LAYOUTTASK1|Q3|room03|SESSION|HASH8|DATA

Offline analysis:
encoded string -> Decoder -> validation -> trial CSV / event CSV
```

## 2. 推荐目录结构

```text
layout-task-player/
  package.json
  index.html
  vite.config.ts
  tsconfig.json

  public/
    layout-task/
      manifest.json
      assets/
        objects.json
        backgrounds.json
        objects/
          chair_a.svg
          table_a.svg
        backgrounds/
          room01.svg
          room02.png
      behaviors/
        behaviors.json
      tasks/
        room01.json
        room02.json
        room03.json

  src/
    main.ts
    experiment.ts

    plugins/
      jspsych-layout-task.ts

    core/
      config-loader.ts
      config-validator.ts
      renderer.ts
      interaction-controller.ts
      state-store.ts
      recorder.ts
      encoder.ts
      clipboard-service.ts
      display-info.ts
      completion-controller.ts

    schemas/
      config.schema.ts
      result.schema.ts

    types/
      config.ts
      runtime.ts
      result.ts
      events.ts

    utils/
      url.ts
      hash.ts
      time.ts
      geometry.ts
      errors.ts

    styles/
      layout-task.css

  tools/
    decoder/
      decode-results.ts
      export-events.ts
      export-trials.ts
```

## 3. 模块划分与职责

### 3.1 ConfigLoader

职责：

- 读取 `manifest.json`。
- 根据 URL 参数 `task` / `q` 或 jsPsych trial 参数选择任务。
- 读取 task file、object library、background library、behavior library。
- 合并默认值。
- 解析 asset / behavior 引用。
- 生成不可变的 `RuntimeTaskConfig`。

建议接口：

```ts
export interface ConfigLoaderOptions {
  baseUrl: string; // usually "/layout-task/"
  manifestPath?: string; // default "manifest.json"
  fetchImpl?: typeof fetch;
}

export interface TaskSelection {
  taskId?: string;
  qid?: string;
}

export class ConfigLoader {
  constructor(options: ConfigLoaderOptions);

  loadManifest(): Promise<ManifestConfig>;
  loadRuntimeConfig(selection: TaskSelection): Promise<RuntimeTaskConfig>;
}
```

关键流程：

```ts
async function loadRuntimeConfig(selection: TaskSelection) {
  const manifest = await loadManifest();
  validateManifest(manifest);

  const taskEntry = findTaskEntry(manifest.tasks, selection);
  const [objects, backgrounds, behaviors, task] = await Promise.all([
    fetchJson(manifest.asset_library),
    fetchJson(manifest.background_library),
    fetchJson(manifest.behavior_library),
    fetchJson(taskEntry.file),
  ]);

  validateLibraries(objects, backgrounds, behaviors);
  validateTask(task);

  const runtime = resolveRuntimeConfig({
    manifest,
    objects,
    backgrounds,
    behaviors,
    task,
  });

  validateRuntimeConfig(runtime);
  return freezeRuntimeConfig(runtime);
}
```

### 3.2 ConfigValidator

职责：

- 使用 Zod 校验 manifest、libraries、task、runtime config、result。
- 输出适合研究者理解的错误信息。
- 检查引用完整性和跨文件一致性。

额外校验：

- task 中 `task_id` / `qid` 与 manifest entry 一致。
- object id 唯一。
- object asset 存在。
- background asset 存在。
- behavior preset 存在。
- grid size > 0。
- rotation step 可以整除 360 是推荐项，不强制。
- 初始对象坐标在世界 viewBox 内是推荐项，可 warning。

建议接口：

```ts
export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export class ConfigValidationError extends Error {
  issues: ValidationIssue[];
}

export function validateManifest(input: unknown): ManifestConfig;
export function validateTask(input: unknown): TaskConfig;
export function validateRuntimeConfig(input: unknown): RuntimeTaskConfig;
export function formatValidationIssues(issues: ValidationIssue[]): string;
```

### 3.3 LayoutTaskPlugin

职责：

- 包装为 jsPsych plugin。
- 接收 `RuntimeTaskConfig` 或配置路径与选择参数。
- 创建播放器容器。
- 初始化 renderer、store、interaction、recorder、completion。
- 在完成后可选写入 `jsPsych.finishTrial(data)`。

建议参数：

```ts
export interface LayoutTaskPluginParams {
  config?: RuntimeTaskConfig;
  baseUrl?: string;
  manifestPath?: string;
  taskId?: string;
  qid?: string;
  autoFinishTrial?: boolean;
  writeEncodedToData?: boolean;
  writeResultToData?: boolean;
}
```

jsPsych plugin skeleton：

```ts
const info = {
  name: "layout-task",
  parameters: {
    config: { type: ParameterType.OBJECT, default: null },
    baseUrl: { type: ParameterType.STRING, default: "/layout-task/" },
    taskId: { type: ParameterType.STRING, default: null },
    qid: { type: ParameterType.STRING, default: null },
    autoFinishTrial: { type: ParameterType.BOOL, default: false },
  },
};

export class LayoutTaskPlugin {
  static info = info;

  constructor(private jsPsych: JsPsych) {}

  async trial(displayElement: HTMLElement, trial: LayoutTaskPluginParams) {
    const config = trial.config ?? await new ConfigLoader({
      baseUrl: trial.baseUrl ?? "/layout-task/",
    }).loadRuntimeConfig({ taskId: trial.taskId, qid: trial.qid });

    const player = createLayoutTaskPlayer({
      root: displayElement,
      config,
      onComplete: (payload) => {
        if (trial.autoFinishTrial) {
          this.jsPsych.finishTrial({
            qid: config.qid,
            task_id: config.taskId,
            encoded: trial.writeEncodedToData ? payload.encoded : undefined,
            result: trial.writeResultToData ? payload.result : undefined,
          });
        }
      },
    });

    player.start();
  }
}
```

### 3.4 Renderer

职责：

- 创建 SVG stage。
- 设置 `viewBox`。
- 渲染底图、对象、控制按钮、可选网格。
- 根据 StateStore 更新 transform。
- 提供 DOM 引用给 DisplayInfoCollector。

建议接口：

```ts
export interface RendererRefs {
  root: HTMLElement;
  svg: SVGSVGElement;
  backgroundElement?: SVGImageElement | SVGElement;
  objectElements: Map<string, SVGGraphicsElement>;
}

export class LayoutTaskRenderer {
  constructor(options: {
    root: HTMLElement;
    config: RuntimeTaskConfig;
    store: StateStore;
  });

  mount(): RendererRefs;
  renderAll(): void;
  updateObject(objectId: string): void;
  setControlsVisible(objectId: string, visible: boolean): void;
  updateControlsDisabled(objectId: string): void;
  setLocked(locked: boolean): void;
  destroy(): void;
}
```

### 3.5 InteractionController

职责：

- 处理 hover、focus、button click、keyboard 可访问性。
- 判断操作是否允许。
- 调用 StateStore 应用 action。
- 通知 Renderer 更新对象和按钮状态。
- 记录有效事件，可选记录 blocked event。
- 预留 drag adapter。

建议接口：

```ts
export type LayoutAction =
  | "move_left"
  | "move_right"
  | "move_up"
  | "move_down"
  | "rotate_cw"
  | "rotate_ccw"
  | "drag_start"
  | "drag_move"
  | "drag_end";

export interface ActionRequest {
  objectId: string;
  action: LayoutAction;
  pointer?: { clientX: number; clientY: number; worldX?: number; worldY?: number };
}

export class InteractionController {
  bind(): void;
  unbind(): void;
  requestAction(request: ActionRequest): ActionResult;
}
```

### 3.6 StateStore

职责：

- 管理当前对象状态。
- 管理每个对象的操作计数。
- 管理 `locked`。
- 提供 final state。
- 不直接操作 DOM。

建议接口：

```ts
export class StateStore {
  constructor(config: RuntimeTaskConfig);

  isLocked(): boolean;
  lock(): void;

  getObjectState(objectId: string): ObjectRuntimeState;
  getAllObjectStates(): Record<string, ObjectRuntimeState>;
  getCounts(objectId: string): OperationCounts;

  canApply(objectId: string, action: LayoutAction): CanApplyResult;
  applyAction(objectId: string, action: LayoutAction): StateTransition;

  getFinalState(): FinalState;
}
```

### 3.7 Recorder

职责：

- 记录 task start / end 时间。
- 记录 event log。
- 记录 display info。
- 生成 `LayoutTaskResult`。

建议接口：

```ts
export class Recorder {
  constructor(options: {
    config: RuntimeTaskConfig;
    sessionId: string;
    store: StateStore;
    displayCollector: DisplayInfoCollector;
  });

  start(): void;
  recordEvent(event: Omit<LayoutTaskEvent, "i" | "t">): LayoutTaskEvent;
  finish(copyTimestamp?: number): LayoutTaskResult;
}
```

### 3.8 Encoder

职责：

- `JSON.stringify`。
- SHA-256 hash。
- LZ-string 压缩。
- 拼接一行输出字符串。
- decode。
- validate hash。

建议接口：

```ts
export interface EncodedLayoutTask {
  version: "LAYOUTTASK1";
  qid: string;
  taskId: string;
  sessionId: string;
  hash8: string;
  encodedData: string;
  output: string;
}

export class LayoutTaskEncoder {
  encode(result: LayoutTaskResult): Promise<EncodedLayoutTask>;
  decode(output: string): Promise<DecodedLayoutTask>;
  validate(output: string): Promise<DecodeValidationResult>;
}
```

### 3.9 ClipboardService

职责：

- 使用 Clipboard API 复制。
- 处理 HTTPS / localhost / permission 失败。
- 提供手动复制 fallback。
- `copy again` 只复制已锁定的同一字符串。

建议接口：

```ts
export interface CopyResult {
  ok: boolean;
  method: "clipboard-api" | "fallback-textarea" | "manual";
  error?: string;
}

export class ClipboardService {
  copy(text: string): Promise<CopyResult>;
}
```

### 3.10 DisplayInfoCollector

职责：

- 采集 viewport、screen、devicePixelRatio。
- 采集 stage 和 background 的 `getBoundingClientRect()`。
- 采集图片 natural size。
- 可选记录 userAgent。

建议接口：

```ts
export class DisplayInfoCollector {
  constructor(private refs: RendererRefs, private config: RuntimeTaskConfig);
  collect(): Promise<DisplayInfo>;
}
```

### 3.11 CompletionController

职责：

- 执行二次确认。
- lock store。
- 生成最终 result。
- encode。
- copy。
- 展示完成界面。
- 管理再次复制。

建议接口：

```ts
export interface CompletionPayload {
  result: LayoutTaskResult;
  encoded: EncodedLayoutTask;
  copyResult: CopyResult;
}

export class CompletionController {
  constructor(options: {
    root: HTMLElement;
    config: RuntimeTaskConfig;
    store: StateStore;
    recorder: Recorder;
    renderer: LayoutTaskRenderer;
    encoder: LayoutTaskEncoder;
    clipboard: ClipboardService;
    onComplete?: (payload: CompletionPayload) => void;
  });

  requestComplete(): Promise<void>;
  copyAgain(): Promise<CopyResult>;
}
```

### 3.12 Decoder / Analysis utilities

职责：

- 批量解析问卷导出的字符串。
- 校验 hash 和 header。
- 输出 trial-level CSV。
- 输出 event-level CSV。

建议 CLI：

```text
npm run decode -- --input data/raw.csv --column Q3_text --out data/decoded.jsonl
npm run export:trials -- --input data/decoded.jsonl --out data/trials.csv
npm run export:events -- --input data/decoded.jsonl --out data/events.csv
```

## 4. 数据流

初始化数据流：

```text
URL params / jsPsych trial params
  -> ConfigLoader
  -> manifest + task + asset libraries + behavior library
  -> ConfigValidator
  -> RuntimeTaskConfig
  -> StateStore initial state
  -> Renderer mount
  -> Recorder start
```

交互数据流：

```text
User clicks control
  -> InteractionController.requestAction()
  -> StateStore.canApply()
  -> StateStore.applyAction()
  -> Recorder.recordEvent()
  -> Renderer.updateObject()
  -> Renderer.updateControlsDisabled()
```

完成数据流：

```text
Confirm button
  -> confirm #1
  -> confirm #2
  -> StateStore.lock()
  -> Recorder.finish()
  -> Encoder.encode()
  -> ClipboardService.copy()
  -> Completion screen
```

离线解析：

```text
Survey textbox string
  -> split header
  -> decompress payload
  -> parse JSON
  -> recalculate SHA-256
  -> validate schema and consistency
  -> export trial table / event table
```

## 5. 配置文件设计

### 5.1 manifest.json

```json
{
  "schema": "layouttask.manifest.v1",
  "experiment_id": "floorplan_coherence_v1",
  "title": "Floorplan Coherence Experiment",
  "asset_library": "assets/objects.json",
  "background_library": "assets/backgrounds.json",
  "behavior_library": "behaviors/behaviors.json",
  "tasks": [
    {
      "qid": "Q1",
      "task_id": "room01",
      "file": "tasks/room01.json"
    },
    {
      "qid": "Q3",
      "task_id": "room03",
      "file": "tasks/room03.json"
    }
  ]
}
```

建议增加可选字段：

```ts
interface ManifestConfig {
  schema: "layouttask.manifest.v1";
  experiment_id: string;
  title?: string;
  config_version?: string;
  asset_library: string;
  background_library: string;
  behavior_library: string;
  tasks: ManifestTaskEntry[];
}
```

### 5.2 objects.json

```json
{
  "schema": "layouttask.assets.objects.v1",
  "objects": {
    "chair_a": {
      "type": "svg",
      "src": "assets/objects/chair_a.svg",
      "default_width": 50,
      "default_height": 50,
      "anchor": "center"
    }
  }
}
```

### 5.3 backgrounds.json

```json
{
  "schema": "layouttask.assets.backgrounds.v1",
  "backgrounds": {
    "room03_bg": {
      "type": "image",
      "src": "assets/backgrounds/room03.svg",
      "intrinsic_unit": "cad_unit"
    }
  }
}
```

### 5.4 behaviors.json

```json
{
  "schema": "layouttask.behaviors.v1",
  "behaviors": {
    "move25_rotate45_limited": {
      "movement": {
        "mode": "button",
        "step": 25,
        "max_left": 2,
        "max_right": 2,
        "max_up": 2,
        "max_down": 2
      },
      "rotation": {
        "step": 45,
        "max_cw": 2,
        "max_ccw": 2
      },
      "free_drag": {
        "enabled": false
      }
    }
  }
}
```

### 5.5 task file

```json
{
  "schema": "layouttask.task.v1",
  "task_id": "room03",
  "qid": "Q3",
  "title": "Room 03",
  "world": {
    "viewBox": { "x": -500, "y": -500, "width": 1000, "height": 1000 },
    "origin": { "x": 0, "y": 0 },
    "grid": { "size": 25, "visible": false, "snap": true }
  },
  "background": {
    "asset": "room03_bg",
    "x": -400,
    "y": -300,
    "width": 800,
    "height": 600
  },
  "objects": [
    {
      "id": "chair_01",
      "asset": "chair_a",
      "x": 100,
      "y": 150,
      "rotation": 0,
      "behavior": "move25_rotate45_limited"
    }
  ],
  "completion": {
    "double_confirm": true,
    "lock_after_confirm": true,
    "allow_copy_again": true
  },
  "recording": {
    "record_events": true,
    "record_final_state": true,
    "record_display_info": true,
    "record_user_agent": true,
    "record_blocked_events": false
  }
}
```

## 6. Runtime Config 解析流程

Authoring config 是研究者维护的拆分 JSON。Runtime config 是播放器使用的完整对象，所有引用都已解析，所有默认值都已补齐。

解析步骤：

1. 读取 URL：`?task=room03&q=Q3`。
2. 加载 manifest。
3. 通过 `task_id` 优先匹配，`qid` 作为一致性校验；如果只有 `qid`，则按 `qid` 匹配。
4. 加载 task、objects、backgrounds、behaviors。
5. 应用默认值。
6. 将 task object 的 `asset` 字符串解析为 `resolvedAsset`。
7. 将 task object 的 `behavior` 字符串解析为 `resolvedBehavior`。
8. 将 background 的 `asset` 字符串解析为 `resolvedBackgroundAsset`。
9. 生成配置 hash，可用于结果中记录 `task_config_hash`。
10. freeze runtime config，避免运行期意外修改。

默认值建议：

```ts
const DEFAULT_WORLD = {
  origin: { x: 0, y: 0 },
  grid: { size: 25, visible: false, snap: true },
};

const DEFAULT_OBJECT = {
  rotation: 0,
  anchor: "center",
};

const DEFAULT_COMPLETION = {
  double_confirm: true,
  lock_after_confirm: true,
  allow_copy_again: true,
};

const DEFAULT_RECORDING = {
  record_events: true,
  record_final_state: true,
  record_display_info: true,
  record_user_agent: true,
  record_blocked_events: false,
};
```

## 7. TypeScript 类型设计

### 7.1 配置类型

```ts
export type AssetType = "svg" | "png" | "jpg" | "image";
export type Anchor = "center" | "top_left";

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GridConfig {
  size: number;
  visible: boolean;
  snap: boolean;
}

export interface WorldConfig {
  viewBox: ViewBox;
  origin: Point;
  grid: GridConfig;
}

export interface ObjectAssetConfig {
  type: AssetType;
  src: string;
  default_width: number;
  default_height: number;
  anchor?: Anchor;
}

export interface BackgroundAssetConfig {
  type: "image" | "svg";
  src: string;
  intrinsic_unit?: "cad_unit" | "px" | "unknown";
}

export interface MovementBehavior {
  mode: "none" | "button" | "drag";
  step?: number;
  max_left?: number;
  max_right?: number;
  max_up?: number;
  max_down?: number;
}

export interface RotationBehavior {
  step?: number;
  max_cw?: number;
  max_ccw?: number;
}

export interface FreeDragBehavior {
  enabled: boolean;
  snap?: boolean;
  bounds?: "world" | "background" | { x: number; y: number; width: number; height: number };
}

export interface BehaviorConfig {
  movement: MovementBehavior;
  rotation?: RotationBehavior;
  free_drag: FreeDragBehavior;
}

export interface TaskObjectConfig {
  id: string;
  asset: string;
  x: number;
  y: number;
  rotation?: number;
  width?: number;
  height?: number;
  anchor?: Anchor;
  behavior: string;
}

export interface TaskBackgroundConfig {
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TaskConfig {
  schema: "layouttask.task.v1";
  task_id: string;
  qid: string;
  title?: string;
  world: WorldConfig;
  background: TaskBackgroundConfig;
  objects: TaskObjectConfig[];
  completion?: CompletionConfig;
  recording?: RecordingConfig;
}
```

### 7.2 Runtime 类型

```ts
export interface RuntimeTaskObject {
  id: string;
  assetId: string;
  asset: ObjectAssetConfig & { srcResolved: string };
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  anchor: Anchor;
  behaviorId: string;
  behavior: ResolvedBehaviorConfig;
}

export interface RuntimeBackground {
  assetId: string;
  asset: BackgroundAssetConfig & { srcResolved: string };
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RuntimeTaskConfig {
  schema: "layouttask.runtime.v1";
  experimentId: string;
  configVersion?: string;
  taskConfigHash?: string;
  qid: string;
  taskId: string;
  title?: string;
  baseUrl: string;
  world: WorldConfig;
  background: RuntimeBackground;
  objects: RuntimeTaskObject[];
  completion: Required<CompletionConfig>;
  recording: Required<RecordingConfig>;
}
```

### 7.3 状态类型

```ts
export interface OperationCounts {
  left: number;
  right: number;
  up: number;
  down: number;
  cw: number;
  ccw: number;
}

export interface ObjectPose {
  x: number;
  y: number;
  r: number;
}

export interface ObjectRuntimeState extends ObjectPose {
  id: string;
  counts: OperationCounts;
}

export interface FinalObjectState extends ObjectPose {
  counts: OperationCounts;
}

export type FinalState = Record<string, FinalObjectState>;
```

## 8. Zod Schema 设计建议

使用 Zod 的好处是可以在浏览器和 Node decoder 中复用 schema。建议将 schema 与 TS 类型放在一起，类型由 `z.infer` 导出。

示例：

```ts
import { z } from "zod";

export const viewBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const gridSchema = z.object({
  size: z.number().positive(),
  visible: z.boolean().default(false),
  snap: z.boolean().default(true),
});

export const behaviorSchema = z.object({
  movement: z.object({
    mode: z.enum(["none", "button", "drag"]),
    step: z.number().positive().optional(),
    max_left: z.number().int().nonnegative().optional(),
    max_right: z.number().int().nonnegative().optional(),
    max_up: z.number().int().nonnegative().optional(),
    max_down: z.number().int().nonnegative().optional(),
  }),
  rotation: z.object({
    step: z.number().positive().optional(),
    max_cw: z.number().int().nonnegative().optional(),
    max_ccw: z.number().int().nonnegative().optional(),
  }).optional(),
  free_drag: z.object({
    enabled: z.boolean().default(false),
    snap: z.boolean().optional(),
  }).default({ enabled: false }),
});

export const taskObjectSchema = z.object({
  id: z.string().min(1),
  asset: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  rotation: z.number().finite().default(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  anchor: z.enum(["center", "top_left"]).optional(),
  behavior: z.string().min(1),
});
```

跨文件引用校验不适合只靠 Zod，应在 resolver 阶段做：

```ts
function assertReferenceExists(
  kind: "object asset" | "background asset" | "behavior",
  id: string,
  exists: boolean,
) {
  if (!exists) {
    throw new ConfigValidationError([{
      path: kind,
      message: `Unknown ${kind}: ${id}`,
      severity: "error",
    }]);
  }
}
```

## 9. jsPsych Plugin 接口设计

两种使用方式：

### 9.1 独立页面模式

`src/main.ts`：

```ts
async function bootstrapStandalone() {
  const params = parseLayoutTaskUrlParams(window.location.search);
  const loader = new ConfigLoader({ baseUrl: params.baseUrl ?? "/layout-task/" });
  const config = await loader.loadRuntimeConfig({
    taskId: params.task,
    qid: params.q,
  });

  createLayoutTaskPlayer({
    root: document.querySelector("#app")!,
    config,
  }).start();
}
```

### 9.2 jsPsych timeline 模式

```ts
const timeline = [
  {
    type: jsPsychInstructions,
    pages: ["请完成下面的空间布局任务。"],
  },
  {
    type: jsPsychLayoutTask,
    baseUrl: "/layout-task/",
    taskId: "room03",
    qid: "Q3",
    autoFinishTrial: true,
    writeEncodedToData: true,
  },
];
```

plugin 完成时推荐写入精简字段：

```ts
{
  plugin: "layout-task",
  qid: "Q3",
  task_id: "room03",
  session: "K8F2M9",
  encoded: "LAYOUTTASK1|Q3|room03|K8F2M9|A1B2C3D4|...",
  duration_ms: 389689,
  event_count: 12,
  copy_ok: true
}
```

完整 result 可选写入 jsPsych.data，但注意体积较大。问卷平台文本框流程中，核心输出仍是一行 encoded string。

## 10. SVG 渲染与坐标系统设计

### 10.1 世界坐标

SVG stage 使用 world `viewBox`：

```html
<svg viewBox="-500 -500 1000 1000" preserveAspectRatio="xMidYMid meet">
  ...
</svg>
```

世界坐标中：

- `x` 向右为正。
- `y` 按 SVG 默认向下为正。若研究者希望数学坐标系 y 向上，可后续增加 `axis.y = "up"`，第一版不建议复杂化。
- `origin` 用作参考点、调试网格和未来坐标转换，不改变 SVG 基础坐标。

### 10.2 底图渲染

普通图片和 SVG 文件统一用 `<image>`：

```ts
backgroundEl.setAttribute("href", background.asset.srcResolved);
backgroundEl.setAttribute("x", String(background.x));
backgroundEl.setAttribute("y", String(background.y));
backgroundEl.setAttribute("width", String(background.width));
backgroundEl.setAttribute("height", String(background.height));
```

优点：

- PNG/JPG/SVG 统一路径。
- `getBoundingClientRect()` 可直接采集显示尺寸。
- CAD 导出的 SVG 不必 inline，避免命名冲突和脚本风险。

### 10.3 对象锚点和 transform

推荐将每个对象渲染为 `<g data-object-id="chair_01">`，对象图像位于局部坐标：

center anchor：

```html
<g transform="translate(100 150) rotate(45)">
  <image href="chair.svg" x="-25" y="-25" width="50" height="50" />
</g>
```

top_left anchor：

```html
<g transform="translate(100 150) rotate(45)">
  <image href="chair.svg" x="0" y="0" width="50" height="50" />
</g>
```

控制按钮也可以作为 object group 的 sibling 或 overlay group。为了避免随对象旋转，推荐：

```text
object-layer
  g.object transform="translate(x y) rotate(r)"
control-layer
  g.controls transform="translate(x y)"
```

### 10.4 控制按钮

按钮可以用 SVG 元素实现：

- 上下左右：三角形或 lucide icon 的 SVG path。
- 旋转：可以使用内置 path 或在 HTML overlay 中使用 lucide 图标。

为保证静态和轻量，第一版推荐 SVG control：

```text
controls for object:
  up    at (x, y - height/2 - gap)
  down  at (x, y + height/2 + gap)
  left  at (x - width/2 - gap, y)
  right at (x + width/2 + gap, y)
  ccw   at (x - width/2 - gap, y - height/2 - gap)
  cw    at (x + width/2 + gap, y - height/2 - gap)
```

每个 control button 固定尺寸，避免 hover 造成布局变化。disabled 使用 `opacity`、`pointer-events: none` 和 `aria-disabled`。

### 10.5 网格

网格默认不显示。调试模式使用 SVG `<pattern>`：

```html
<defs>
  <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
    <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#ccc" stroke-width="1" />
  </pattern>
</defs>
<rect x="-500" y="-500" width="1000" height="1000" fill="url(#grid)" />
```

移动时吸附：

```ts
function snap(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}
```

## 11. 交互控制逻辑

核心动作映射：

```ts
const ACTION_TO_COUNT_KEY = {
  move_left: "left",
  move_right: "right",
  move_up: "up",
  move_down: "down",
  rotate_cw: "cw",
  rotate_ccw: "ccw",
} as const;
```

限制判断：

```ts
function canApplyAction(state, behavior, action): CanApplyResult {
  if (locked) return { ok: false, reason: "locked" };

  if (action === "move_left") {
    if (behavior.movement.mode !== "button") return { ok: false, reason: "movement_disabled" };
    if (state.counts.left >= (behavior.movement.max_left ?? Infinity)) {
      return { ok: false, reason: "limit_reached" };
    }
  }

  return { ok: true };
}
```

执行动作：

```ts
function applyAction(id: string, action: LayoutAction): StateTransition {
  const before = clonePose(state[id]);
  const behavior = getBehavior(id);
  const next = { ...state[id] };

  switch (action) {
    case "move_left":
      next.x -= behavior.movement.step ?? world.grid.size;
      next.counts.left += 1;
      break;
    case "move_right":
      next.x += behavior.movement.step ?? world.grid.size;
      next.counts.right += 1;
      break;
    case "move_up":
      next.y -= behavior.movement.step ?? world.grid.size;
      next.counts.up += 1;
      break;
    case "move_down":
      next.y += behavior.movement.step ?? world.grid.size;
      next.counts.down += 1;
      break;
    case "rotate_cw":
      next.r = normalizeRotation(next.r + (behavior.rotation?.step ?? 45));
      next.counts.cw += 1;
      break;
    case "rotate_ccw":
      next.r = normalizeRotation(next.r - (behavior.rotation?.step ?? 45));
      next.counts.ccw += 1;
      break;
  }

  if (world.grid.snap && action.startsWith("move_")) {
    next.x = snap(next.x, world.grid.size);
    next.y = snap(next.y, world.grid.size);
  }

  state[id] = next;
  return { objectId: id, action, before, after: clonePose(next), counts: cloneCounts(next.counts) };
}
```

blocked event 策略：

- 默认不记录 blocked event，避免事件日志过多且影响行为解释。
- 可通过 `recording.record_blocked_events = true` 记录。
- blocked event 字段包含 `valid: false` 和 `reason`。

## 12. 状态管理设计

StateStore 是唯一状态源。Renderer 只读取 StateStore，InteractionController 只通过 StateStore 修改状态。

初始化：

```ts
const initialState = Object.fromEntries(config.objects.map((obj) => [
  obj.id,
  {
    id: obj.id,
    x: obj.x,
    y: obj.y,
    r: normalizeRotation(obj.rotation),
    counts: { left: 0, right: 0, up: 0, down: 0, cw: 0, ccw: 0 },
  },
]));
```

final state：

```ts
getFinalState(): FinalState {
  return mapValues(this.objectStates, (s) => ({
    x: s.x,
    y: s.y,
    r: s.r,
    counts: { ...s.counts },
  }));
}
```

锁定策略：

- `locked = true` 后 `canApply` 一律返回 false。
- Renderer 隐藏或禁用控制层。
- Completion screen 不重建 result，不重新读取当前状态。

## 13. 事件记录格式

事件类型：

```ts
export interface LayoutTaskEvent {
  i: number;
  t: number; // ms since task start
  object: string;
  action: LayoutAction;
  valid: boolean;
  blocked_reason?: "locked" | "limit_reached" | "movement_disabled" | "rotation_disabled";
  before?: ObjectPose;
  after?: ObjectPose;
  counts?: OperationCounts;
  pointer?: {
    clientX: number;
    clientY: number;
    worldX?: number;
    worldY?: number;
  };
}
```

有效事件示例：

```json
{
  "i": 2,
  "t": 2912,
  "object": "chair_01",
  "action": "rotate_cw",
  "valid": true,
  "before": { "x": 125, "y": 150, "r": 0 },
  "after": { "x": 125, "y": 150, "r": 45 },
  "counts": { "left": 0, "right": 1, "up": 0, "down": 0, "cw": 1, "ccw": 0 }
}
```

blocked event 示例：

```json
{
  "i": 7,
  "t": 9102,
  "object": "chair_01",
  "action": "move_left",
  "valid": false,
  "blocked_reason": "limit_reached"
}
```

## 14. 结果数据 Schema

建议结果对象：

```ts
export interface LayoutTaskResult {
  schema: "layouttask.result.v1";
  exp: string;
  qid: string;
  task_id: string;
  session: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  display?: DisplayInfo;
  task_config_hash?: string;
  events: LayoutTaskEvent[];
  final_state: FinalState;
  locked: true;
  copy_timestamp?: number;
  user_agent?: string;
}
```

JSON 示例：

```json
{
  "schema": "layouttask.result.v1",
  "exp": "floorplan_coherence_v1",
  "qid": "Q3",
  "task_id": "room03",
  "session": "K8F2M9",
  "start_time": 1777884321123,
  "end_time": 1777884710812,
  "duration_ms": 389689,
  "task_config_hash": "d1e4a8bf",
  "display": {},
  "events": [],
  "final_state": {},
  "locked": true,
  "copy_timestamp": 1777884710901
}
```

Zod 片段：

```ts
export const resultSchema = z.object({
  schema: z.literal("layouttask.result.v1"),
  exp: z.string().min(1),
  qid: z.string().min(1),
  task_id: z.string().min(1),
  session: z.string().min(1),
  start_time: z.number().int().positive(),
  end_time: z.number().int().positive(),
  duration_ms: z.number().int().nonnegative(),
  display: displayInfoSchema.optional(),
  task_config_hash: z.string().optional(),
  events: z.array(layoutTaskEventSchema),
  final_state: z.record(finalObjectStateSchema),
  locked: z.literal(true),
  copy_timestamp: z.number().int().positive().optional(),
  user_agent: z.string().optional(),
});
```

## 15. 编码、压缩与 Hash 校验流程

输出字符串格式：

```text
LAYOUTTASK1|Q3|room03|SESSIONID|HASH8|ENCODED_DATA
```

编码流程：

```ts
async function encode(result: LayoutTaskResult): Promise<EncodedLayoutTask> {
  const json = JSON.stringify(result);
  const hash = await sha256Hex(json);
  const hash8 = hash.slice(0, 8).toUpperCase();
  const encodedData = LZString.compressToEncodedURIComponent(json);

  const output = [
    "LAYOUTTASK1",
    result.qid,
    result.task_id,
    result.session,
    hash8,
    encodedData,
  ].join("|");

  return {
    version: "LAYOUTTASK1",
    qid: result.qid,
    taskId: result.task_id,
    sessionId: result.session,
    hash8,
    encodedData,
    output,
  };
}
```

hash：

```ts
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

解码流程：

```ts
async function decode(output: string): Promise<DecodedLayoutTask> {
  const parts = output.trim().split("|");
  if (parts.length !== 6) throw new DecodeError("Invalid field count");

  const [version, qid, taskId, sessionId, hash8, encodedData] = parts;
  if (version !== "LAYOUTTASK1") throw new DecodeError("Unsupported version");

  const json = LZString.decompressFromEncodedURIComponent(encodedData);
  if (!json) throw new DecodeError("Cannot decompress data");

  const fullHash = await sha256Hex(json);
  const hashOk = fullHash.slice(0, 8).toUpperCase() === hash8.toUpperCase();

  const parsed = JSON.parse(json);
  const result = resultSchema.parse(parsed);

  const headerOk =
    result.qid === qid &&
    result.task_id === taskId &&
    result.session === sessionId;

  return { header: { version, qid, taskId, sessionId, hash8 }, result, hashOk, headerOk };
}
```

校验建议：

- `hashOk === true`。
- header 与 JSON 内部一致。
- `locked === true`。
- `duration_ms === end_time - start_time`，允许 1-2ms 浮动。
- event `i` 连续递增。
- final state 可由 events replay 后得到，作为高级校验。
- 坐标、角度、counts 不超过对应 behavior 限制。

## 16. Clipboard 与完成界面逻辑

确认流程：

```ts
async function requestComplete() {
  if (store.isLocked()) return;

  if (config.completion.double_confirm) {
    const ok1 = window.confirm("确认提交后将不能继续修改。是否继续？");
    if (!ok1) return;
    const ok2 = window.confirm("请再次确认：提交后对象位置将被锁定。");
    if (!ok2) return;
  }

  store.lock();
  renderer.setLocked(true);

  const result = recorder.finish(Date.now());
  const encoded = await encoder.encode(result);
  lockedEncoded = encoded;

  const copyResult = await clipboard.copy(encoded.output);
  showCompletionScreen({ encoded, copyResult });
  onComplete?.({ result, encoded, copyResult });
}
```

再次复制：

```ts
async function copyAgain() {
  if (!lockedEncoded) throw new Error("No locked result available");
  return clipboard.copy(lockedEncoded.output);
}
```

Clipboard fallback：

1. 首选 `navigator.clipboard.writeText(text)`。
2. 如果失败，创建只读 textarea，选中文本，尝试 `document.execCommand("copy")`。
3. 如果仍失败，显示文本框和“请手动复制”的提示。

完成界面内容：

- 显示复制成功或需要手动复制。
- 提示被试返回问卷粘贴数据。
- 显示“再次复制”按钮。
- 可显示 session/task/qid 以便排错。
- 不显示重新开始或编辑按钮，避免破坏锁定语义。

## 17. Display Info 采集设计

类型：

```ts
export interface RectInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DisplayInfo {
  viewport: {
    width: number;
    height: number;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
  };
  devicePixelRatio: number;
  stageRect?: RectInfo;
  backgroundRect?: RectInfo;
  backgroundNatural?: {
    width: number;
    height: number;
  };
  backgroundWorld?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

采集伪代码：

```ts
function rectToInfo(rect: DOMRect): RectInfo {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

async function collect(): Promise<DisplayInfo> {
  const info: DisplayInfo = {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
    },
    devicePixelRatio: window.devicePixelRatio,
    stageRect: rectToInfo(refs.svg.getBoundingClientRect()),
    backgroundWorld: {
      x: config.background.x,
      y: config.background.y,
      width: config.background.width,
      height: config.background.height,
    },
  };

  if (refs.backgroundElement) {
    info.backgroundRect = rectToInfo(refs.backgroundElement.getBoundingClientRect());
  }

  const img = await loadImage(config.background.asset.srcResolved).catch(() => undefined);
  if (img) {
    info.backgroundNatural = {
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }

  return info;
}
```

注意：

- 不依赖浏览器 zoom API。
- userAgent 放在 result 顶层或 display 内均可，推荐顶层 `user_agent`。
- SVG natural size 可能不稳定，需优先记录配置中的 world width/height 和实际 CSS rect。

## 18. 解码与后期分析脚本设计

### 18.1 decode-results.ts

输入：

- CSV 文件。
- 包含 encoded string 的列名。

输出：

- JSONL，每行一个 decode 结果。

输出结构：

```ts
interface DecodedRecord {
  source_row: number;
  source_column: string;
  raw: string;
  valid: boolean;
  errors: string[];
  header?: {
    version: string;
    qid: string;
    taskId: string;
    sessionId: string;
    hash8: string;
  };
  result?: LayoutTaskResult;
  hash_ok?: boolean;
  header_ok?: boolean;
}
```

### 18.2 export-trials.ts

trial-level CSV 字段：

```text
source_row,valid,errors,exp,qid,task_id,session,start_time,end_time,
duration_ms,event_count,locked,hash_ok,header_ok,viewport_width,
viewport_height,screen_width,screen_height,device_pixel_ratio,
stage_width,stage_height,background_width,background_height
```

可额外展开 final state：

```text
chair_01_x,chair_01_y,chair_01_r,chair_01_left,chair_01_right,...
```

如果对象很多，建议将 final state 单独导出为 long table。

### 18.3 export-events.ts

event-level CSV 字段：

```text
source_row,exp,qid,task_id,session,event_i,event_t,object,action,
valid,blocked_reason,before_x,before_y,before_r,after_x,after_y,after_r,
count_left,count_right,count_up,count_down,count_cw,count_ccw
```

### 18.4 replay 校验

后期分析工具可以加载对应 runtime config，对事件重放：

```ts
function replayEvents(config: RuntimeTaskConfig, events: LayoutTaskEvent[]) {
  const store = new StateStore(config);
  for (const event of events.filter((e) => e.valid)) {
    const transition = store.applyAction(event.object, event.action);
    assertEqual(transition.after, event.after);
  }
  return store.getFinalState();
}
```

replay 校验不是首版必须，但对严肃实验数据很有价值。

## 19. 错误处理策略

### 19.1 配置加载错误

页面展示研究者可理解错误：

```text
Layout Task 配置加载失败
task=room03 q=Q3
原因：Unknown behavior: move25_rotate45_limited
文件：tasks/room03.json
```

控制台输出完整 stack 和 Zod issues。

### 19.2 资源加载错误

- 底图加载失败：阻止任务开始，提示资源路径。
- 对象图片加载失败：阻止任务开始，避免数据不可比。
- natural size 采集失败：不阻止任务，记录 warning。

### 19.3 剪贴板失败

- 不影响 result 锁定。
- 完成界面显示手动复制文本框。
- copyResult 记录 `ok: false` 和错误信息。

### 19.4 jsPsych 错误

如果 plugin 内部失败：

- 页面显示错误。
- 可调用 `jsPsych.finishTrial({ error: true, message })`，但只在实验设计允许时启用。

### 19.5 不支持环境

最低能力要求：

- SVG。
- Promise / async。
- Web Crypto API。

如果 `crypto.subtle` 不可用：

- HTTPS / localhost 通常可用。
- file:// 可能不可用。开发时建议本地文件服务器。
- 可选引入轻量 SHA-256 fallback，但第一版可以提示“请使用 HTTPS 或本地服务器”。

## 20. 可扩展性设计

### 20.1 交互模式扩展

预留 `interactionMode`：

```ts
type InteractionMode = "button" | "free_drag" | "button_and_drag" | "readonly";
```

未来可以引入：

- native pointer events drag adapter。
- interactjs adapter。
- drag bounds。
- collision constraints。
- group movement。

### 20.2 对象类型扩展

当前对象：

```ts
type RuntimeObjectKind = "image";
```

未来扩展：

```ts
type RuntimeObjectKind = "image" | "rect" | "circle" | "polygon" | "inline_svg" | "cad_symbol";
```

Renderer 可以拆为：

```ts
interface ObjectRenderer {
  renderObject(obj: RuntimeTaskObject, state: ObjectRuntimeState): SVGGraphicsElement;
  updateObject(el: SVGGraphicsElement, state: ObjectRuntimeState): void;
}
```

### 20.3 版本兼容

每种文件均包含 schema：

- `layouttask.manifest.v1`
- `layouttask.task.v1`
- `layouttask.assets.objects.v1`
- `layouttask.behaviors.v1`
- `layouttask.result.v1`
- 输出头：`LAYOUTTASK1`

升级策略：

- 小改动只增加 optional 字段。
- 破坏性改动升级 schema 到 v2。
- Decoder 保留 v1 decode。
- Runtime resolver 可提供 migration：

```ts
function migrateTaskConfig(input: unknown): TaskConfigV1 | TaskConfigV2 {
  if (input.schema === "layouttask.task.v1") return input;
  if (input.schema === "layouttask.task.v2") return migrateV2ToRuntime(input);
  throw new Error("Unsupported task schema");
}
```

### 20.4 国际化

UI 文案集中：

```ts
interface LayoutTaskMessages {
  confirm1: string;
  confirm2: string;
  completeTitle: string;
  copyAgain: string;
  manualCopy: string;
}
```

默认中文，可配置英文。

## 21. 分阶段开发计划

### v0.1 Minimal Player
Status: done

目标：

- Vite + TypeScript 项目初始化。
- 读取单个 task JSON。
- 显示 SVG/PNG 底图。
- 显示对象。
- 点击对象旋转 45 度。
- 记录 final state。
- 复制裸 JSON。

验收：

- `room01.json` 可以被加载。
- 点击对象后画面更新。
- 确认后剪贴板中是 JSON。

### v0.2 Grid + Movement
Status: done

目标：

- 加入 world viewBox。
- 加入隐藏网格配置。
- 支持上下左右步进移动。
- 支持 snap to grid。
- 初步 StateStore。

验收：

- 对象移动坐标符合 grid step。
- final state 坐标正确。

### v0.3 Controls + Limits
Status: done

目标：

- hover 显示控制图标。
- 每方向操作次数限制。
- disabled control。
- 完整 event log。

验收：

- 达到限制后按钮不可点击。
- event log 包含 before / after / counts。

### v0.4 Data Encoding
Status: done

目标：

- session id。
- display info。
- result schema。
- LZ-string 压缩。
- SHA-256 hash。
- `LAYOUTTASK1|...` 输出。
- 再次复制。

验收：

- encode/decode roundtrip 成功。
- 修改 encoded payload 后 hash 校验失败。

### v0.5 jsPsych Plugin Integration
Status: done

目标：

- 实现 plugin wrapper。
- 支持 trial params。
- 支持 jsPsych preload。
- 完成后写入 jsPsych.data。

验收：

- jsPsych timeline 中可运行 Layout Task trial。
- autoFinishTrial 可按配置启用。

### v0.6 Modular Config
Status: done

目标：

- manifest。
- object library。
- background library。
- behavior library。
- runtime resolver。
- Zod validation。
- 友好错误提示。

验收：

- `?task=room03&q=Q3` 正确选择任务。
- 缺失引用会给出明确错误。

### v0.7 Decoder Tools
Status: done

目标：

- Node CLI decode。
- hash validation。
- trial-level CSV。
- event-level CSV。

验收：

- 可解析问卷导出的 CSV。
- 输出 valid/invalid。

### v0.7.1 Decoder Validation
Status: done

- 已实现 decoded result validation
- 已为 trial CSV 增加 validation columns
- 已增加 decoder unit tests

### v0.8 Drag Interface
Status: done

目标：

- 抽象 drag adapter。
- 可选自由拖动。
- snap to grid。
- drag event recording。

验收：

- 不影响按钮式交互。
- drag events 可被 decoder 识别。

Current repo status / 当前实现状态

- current branch: `feature/decoder-validation`
- latest milestone commits:
  - `3329923 feat: add layout task decoder tools`
  - `71b5226 feat: validate decoded layout task results`
  - `5e4322c feat: integrate layout task with jspsych`
  - `3456c33 docs: improve bilingual code comments`

## 22. 推荐 package.json dependencies

运行依赖：

```json
{
  "dependencies": {
    "@jspsych/plugin-instructions": "^2.1.0",
    "jspsych": "^8.0.0",
    "lz-string": "^1.5.0",
    "zod": "^3.23.8"
  }
}
```

开发依赖：

```json
{
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0",
    "tsx": "^4.16.0",
    "csv-parse": "^5.5.6",
    "csv-stringify": "^6.5.0"
  }
}
```

可选依赖：

```json
{
  "optionalDependencies": {
    "interactjs": "^1.10.27",
    "lucide": "^0.468.0"
  }
}
```

说明：

- `jspsych` 版本需以实际项目锁定为准。
- `lucide` 若只用于 HTML 按钮图标可引入；若 SVG controls 自绘，则不必引入。
- decoder CLI 可以复用浏览器端 encoder/schema，建议通过 tsx 直接运行 TypeScript。

## 23. 可能风险与简化建议

### 23.1 剪贴板权限

风险：Clipboard API 通常要求 HTTPS 或 localhost，部分问卷平台内嵌 iframe 可能阻止复制。

建议：

- GitHub Pages / GitLab Pages 使用 HTTPS。
- 始终提供手动复制 fallback。
- 结果锁定与复制成功解耦，复制失败时不能允许继续编辑。

### 23.2 静态部署路径

风险：GitHub Pages 子路径部署时 `/layout-task/` 和相对路径容易混淆。

建议：

- ConfigLoader 使用 `baseUrl` 统一 resolve。
- 所有配置文件里的路径相对于 `public/layout-task/`。
- 支持 URL 参数 `base` 仅用于调试，正式实验中固定。

### 23.3 SVG 坐标与 CAD 坐标差异

风险：CAD 导出 SVG 的坐标、单位、y 方向可能与实验预期不一致。

建议：

- 第一版要求研究者预处理底图为合适 viewBox / 图片尺寸。
- 文档中明确：播放器不直接读取 DWG/DXF。
- 记录 background world size 和 CSS rect，便于后期排查。

### 23.4 屏幕尺寸差异

风险：不同设备显示面积不同，可能影响空间判断。

建议：

- 设置最小 viewport 提示。
- 记录 display info。
- 可在 manifest 中声明 `min_viewport`，不满足时提示但允许继续或阻止，由实验者配置。

### 23.5 输出字符串过长

风险：事件日志很多时，问卷文本框可能有长度限制。

建议：

- 默认压缩。
- 控制事件记录粒度。
- 不把完整 runtime config 写入 result，只写 `task_config_hash`。
- 对 drag move 事件采样或只记录 drag start/end。

### 23.6 被试修改字符串

风险：静态页面无法防止恶意篡改。

建议：

- hash 只能做完整性校验，不是安全签名。
- 后期 validator 检查合理性和 replay。
- 若需要防伪，必须引入后端签名或服务器 session，不属于当前静态部署约束。

### 23.7 jsPsych 和独立页面的边界

风险：如果所有逻辑写进 plugin，会难以独立运行和测试。

建议：

- 核心播放器使用 `createLayoutTaskPlayer()`。
- jsPsych plugin 只负责生命周期包装。
- decoder 与 encoder/schema 共享代码。

## 24. 实现优先级建议

第一轮实现应尽量收敛：

1. 先实现独立页面，不急于 jsPsych。
2. 只支持 `<image>` 底图和 `<image>` 对象。
3. 只支持 center anchor。
4. 只支持按钮式移动和旋转。
5. 先记录有效事件，blocked event 作为配置开关。
6. 完成 encode/decode roundtrip 测试后再接入 jsPsych。

这样可以尽早验证实验核心闭环：配置加载、空间交互、锁定、复制、离线解析。jsPsych 集成随后会自然很多。

## 25. 最小测试计划

单元测试：

- `ConfigValidator`：合法配置通过，缺失引用失败。
- `StateStore`：移动、旋转、计数、限制、lock。
- `Encoder`：encode/decode roundtrip，hash mismatch。
- `geometry`：snap、normalizeRotation。

集成测试：

- 加载 `room03` runtime config。
- 渲染 stage 和对象。
- 点击控制按钮后 DOM transform 更新。
- 确认后 locked，按钮禁用，再次复制字符串不变。

离线工具测试：

- 解析单行 encoded。
- 批量 CSV 导出 trial table。
- 批量 CSV 导出 event table。

## 26. 核心工厂函数

推荐提供一个非 jsPsych 的播放器工厂，方便测试和独立页面复用：

```ts
export interface LayoutTaskPlayerOptions {
  root: HTMLElement;
  config: RuntimeTaskConfig;
  onComplete?: (payload: CompletionPayload) => void;
  messages?: Partial<LayoutTaskMessages>;
}

export interface LayoutTaskPlayer {
  start(): void;
  destroy(): void;
  getState(): FinalState;
  isLocked(): boolean;
}

export function createLayoutTaskPlayer(options: LayoutTaskPlayerOptions): LayoutTaskPlayer {
  const sessionId = createSessionId();
  const store = new StateStore(options.config);
  const renderer = new LayoutTaskRenderer({ root: options.root, config: options.config, store });
  const refs = renderer.mount();
  const displayCollector = new DisplayInfoCollector(refs, options.config);
  const recorder = new Recorder({ config: options.config, sessionId, store, displayCollector });
  const interaction = new InteractionController({ config: options.config, store, renderer, recorder });
  const completion = new CompletionController({
    root: options.root,
    config: options.config,
    store,
    recorder,
    renderer,
    encoder: new LayoutTaskEncoder(),
    clipboard: new ClipboardService(),
    onComplete: options.onComplete,
  });

  return {
    start() {
      recorder.start();
      renderer.renderAll();
      interaction.bind();
    },
    destroy() {
      interaction.unbind();
      renderer.destroy();
    },
    getState() {
      return store.getFinalState();
    },
    isLocked() {
      return store.isLocked();
    },
  };
}
```

这条边界非常重要：`createLayoutTaskPlayer()` 是真正的产品核心；`LayoutTaskPlugin` 和 `main.ts` 都只是入口适配层。
