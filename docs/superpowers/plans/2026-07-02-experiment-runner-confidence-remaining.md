# Experiment Runner Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the already-started experiment runner branch so it can be opened locally and through GitHub Pages as a full tutorial -> preview/reconstruction trials -> final CSV flow.

**Architecture:** Keep the current per-trial LayoutTask player and current experiment runner. Add only the missing pieces: demo package scoring reference, a minimal tutorial bubble controller connected to real player events, final docs, and deployment smoke verification. Do not add dependencies.

**Tech Stack:** TypeScript, Vite, jsPsych 8, existing LayoutTask runtime, existing Zod/Vitest setup, `pixi`, `jj`, GitHub Pages static hosting.

---

## Current State

Already implemented in this branch:

- Experiment config schema/types/loader.
- Participant/session id helpers.
- Participant-level CSV/DataPipe helpers.
- Confidence controller and player gating.
- Result schema support for `confidence`.
- jsPsych experiment runner.
- Experiment package preflight CLI and pixi task.
- Draft demo package under `public/experiment`.

Known remaining gaps:

- `public/experiment/layout-task/scoring/scoring-reference.json` is missing, so full package preflight fails.
- Tutorial mode is passed into the player, but no top-layer guided bubble exists yet.
- README/protocol docs do not yet describe the new experiment runner package clearly enough.
- Full verification, local browser smoke, and GitHub Pages smoke still need to be run.

---

## File Structure

- Create: `public/experiment/layout-task/scoring/scoring-reference.json`
  - Minimal scoring reference for tutorial and two formal demo tasks.
- Create: `src/core/tutorial-controller.ts`
  - Pure tutorial step state machine.
- Create: `src/core/tutorial-controller.test.ts`
  - Unit tests for tutorial step advancement.
- Modify: `src/core/layout-task-player.ts`
  - Instantiate tutorial controller when `tutorialMode` is true.
  - Forward real player events into tutorial controller.
- Modify: `src/core/renderer.ts`
  - Add tutorial bubble DOM and methods.
  - Add `data-layout-task-anchor` attributes for stable bubble targets.
- Modify: `src/core/interaction-controller.ts`
  - Add optional tutorial callbacks for select/action/deselect.
- Modify: `src/core/completion-controller.ts`
  - Add optional tutorial callback for submit attempt/success if needed.
- Modify: `src/styles/layout-task.css`
  - Style the tutorial bubble as a top-layer pointer callout.
- Modify: `src/plugins/jspsych-layout-task.test.ts`
  - Keep/extend coverage that `tutorialMode` reaches the player.
- Modify: `README.md`
  - Document experiment runner usage and CSV output.
- Modify: `protocol/player-ingestion.md`
  - Document how Rhino/generated packages feed `experiment.json`.

---

### Task 1: Make The Demo Package Pass Runtime Preflight

**Files:**
- Create: `public/experiment/layout-task/scoring/scoring-reference.json`

- [ ] **Step 1: Add scoring reference**

Create `public/experiment/layout-task/scoring/scoring-reference.json`:

```json
{
  "schema": "layouttask.scoring-reference.v1",
  "experiment_id": "layout_task_demo_v1",
  "tasks": {
    "tutorial_room": {
      "qid": "QTUTORIAL",
      "objects": {
        "chair_01": {
          "role": "variable",
          "group_id": "chair_group",
          "target": {
            "relative": { "dx_steps": 0, "dy_steps": 0, "rotation_steps": 0 }
          }
        },
        "table_01": {
          "role": "variable",
          "group_id": "table_group",
          "target": {
            "relative": { "dx_steps": 0, "dy_steps": 0, "rotation_steps": 0 }
          }
        }
      }
    },
    "scene_001": {
      "qid": "Q001",
      "objects": {
        "chair_01": {
          "role": "variable",
          "group_id": "chair_group",
          "target": {
            "relative": { "dx_steps": 0, "dy_steps": 0, "rotation_steps": 0 }
          }
        },
        "table_01": {
          "role": "variable",
          "group_id": "table_group",
          "target": {
            "relative": { "dx_steps": 0, "dy_steps": 0, "rotation_steps": 0 }
          }
        }
      }
    },
    "scene_002": {
      "qid": "Q002",
      "objects": {
        "chair_01": {
          "role": "variable",
          "group_id": "chair_group",
          "target": {
            "relative": { "dx_steps": 0, "dy_steps": 0, "rotation_steps": 0 }
          }
        },
        "table_01": {
          "role": "variable",
          "group_id": "table_group",
          "target": {
            "relative": { "dx_steps": 0, "dy_steps": 0, "rotation_steps": 0 }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Run package preflight**

Run:

```bash
pixi run validate-experiment-package public/experiment
```

Expected: command exits 0 and prints a JSON report with `"ok": true`.

- [ ] **Step 3: Commit/checkpoint**

With `jj`, describe the working change after this and the later tasks are stable. Do not create a separate commit here unless the user asks for granular commits.

---

### Task 2: Add A Pure Tutorial Step Controller

**Files:**
- Create: `src/core/tutorial-controller.ts`
- Create: `src/core/tutorial-controller.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/core/tutorial-controller.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TutorialController } from "./tutorial-controller";

describe("TutorialController", () => {
  it("starts with the preview explanation step", () => {
    const controller = new TutorialController();

    expect(controller.getCurrentStep()).toMatchObject({
      id: "intro",
      anchor: "flow-modal",
    });
  });

  it("advances only on the expected event", () => {
    const controller = new TutorialController();

    expect(controller.handle("object_selected", { objectId: "chair_01" })).toBe(false);
    expect(controller.getCurrentStep().id).toBe("intro");

    expect(controller.handle("preview_acknowledged")).toBe(true);
    expect(controller.getCurrentStep().id).toBe("preview");
  });

  it("walks through real reconstruction actions", () => {
    const controller = new TutorialController();

    for (const event of [
      "preview_acknowledged",
      "reconstruction_started",
      "object_selected",
      "object_moved_or_rotated",
      "confidence_chosen",
      "object_deselected",
      "second_object_selected",
      "second_confidence_chosen",
      "submitted",
    ] as const) {
      controller.handle(event, event === "object_selected" ? { objectId: "chair_01" } : undefined);
    }

    expect(controller.isComplete()).toBe(true);
    expect(controller.getCurrentStep().id).toBe("complete");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- src/core/tutorial-controller.test.ts
```

Expected: FAIL because `src/core/tutorial-controller.ts` does not exist.

- [ ] **Step 3: Add minimal controller**

Create `src/core/tutorial-controller.ts`:

```ts
export type TutorialEvent =
  | "preview_acknowledged"
  | "reconstruction_started"
  | "object_selected"
  | "object_moved_or_rotated"
  | "confidence_chosen"
  | "object_deselected"
  | "second_object_selected"
  | "second_confidence_chosen"
  | "submitted";

export interface TutorialStep {
  id:
    | "intro"
    | "preview"
    | "select_first"
    | "move_or_rotate"
    | "confidence_first"
    | "deselect"
    | "select_second"
    | "confidence_second"
    | "submit"
    | "complete";
  anchor: string;
  message: string;
  expectedEvent?: TutorialEvent;
}

const steps: TutorialStep[] = [
  {
    id: "intro",
    anchor: "flow-modal",
    message: "接下来先看一张图，请记住房间中家具组的位置和方向。看完后你需要复原场景。",
    expectedEvent: "preview_acknowledged",
  },
  {
    id: "preview",
    anchor: "display-image",
    message: "现在观察刺激图。倒计时结束后图片会消失。",
    expectedEvent: "reconstruction_started",
  },
  {
    id: "select_first",
    anchor: "stage",
    message: "点击一个家具组进入编辑。",
    expectedEvent: "object_selected",
  },
  {
    id: "move_or_rotate",
    anchor: "controls",
    message: "使用箭头移动，或点击旋转按钮调整方向。即使不需要移动，也要继续选择确定度。",
    expectedEvent: "object_moved_or_rotated",
  },
  {
    id: "confidence_first",
    anchor: "confidence",
    message: "为这个家具组选择确定度。每次重新编辑都需要重新选择。",
    expectedEvent: "confidence_chosen",
  },
  {
    id: "deselect",
    anchor: "stage",
    message: "点击空白处退出当前家具组。",
    expectedEvent: "object_deselected",
  },
  {
    id: "select_second",
    anchor: "stage",
    message: "再选择另一个家具组。你必须先完成当前组的确定度，才能切换到其他组。",
    expectedEvent: "second_object_selected",
  },
  {
    id: "confidence_second",
    anchor: "confidence",
    message: "为第二个家具组选择确定度。",
    expectedEvent: "second_confidence_chosen",
  },
  {
    id: "submit",
    anchor: "confirm",
    message: "所有需要复原的家具组都选择确定度后，点击提交。",
    expectedEvent: "submitted",
  },
  {
    id: "complete",
    anchor: "status",
    message: "教程完成。",
  },
];

export class TutorialController {
  private index = 0;
  private selectedObjectIds = new Set<string>();

  getCurrentStep(): TutorialStep {
    return steps[this.index];
  }

  isComplete(): boolean {
    return this.getCurrentStep().id === "complete";
  }

  handle(event: TutorialEvent, payload?: { objectId?: string }): boolean {
    const current = this.getCurrentStep();
    const normalizedEvent = this.normalizeEvent(event, payload);
    if (current.expectedEvent !== normalizedEvent) {
      return false;
    }

    this.index = Math.min(this.index + 1, steps.length - 1);
    return true;
  }

  private normalizeEvent(event: TutorialEvent, payload?: { objectId?: string }): TutorialEvent {
    if (event !== "object_selected" || !payload?.objectId) {
      return event;
    }

    if (this.selectedObjectIds.size > 0 && !this.selectedObjectIds.has(payload.objectId)) {
      this.selectedObjectIds.add(payload.objectId);
      return "second_object_selected";
    }

    this.selectedObjectIds.add(payload.objectId);
    return "object_selected";
  }
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- src/core/tutorial-controller.test.ts
```

Expected: PASS.

---

### Task 3: Render The Tutorial Bubble And Stable Anchors

**Files:**
- Modify: `src/core/renderer.ts`
- Modify: `src/styles/layout-task.css`

- [ ] **Step 1: Add renderer refs and DOM**

In `src/core/renderer.ts`, extend `RendererRefs`:

```ts
tutorialBubbleElement?: HTMLElement;
tutorialBubbleMessageElement?: HTMLElement;
```

In `renderAll()`, add stable anchors:

```ts
shell.dataset.layoutTaskAnchor = "shell";
workspace.dataset.layoutTaskAnchor = "workspace";
stageWrap.dataset.layoutTaskAnchor = "stage";
panel.dataset.layoutTaskAnchor = "panel";
confidenceControl.dataset.layoutTaskAnchor = "confidence";
confirmButton.dataset.layoutTaskAnchor = "confirm";
status.dataset.layoutTaskAnchor = "status";
flowModal.dataset.layoutTaskAnchor = "flow-modal";
```

In `createDisplayImageFrame()`, add:

```ts
frame.dataset.layoutTaskAnchor = "display-image";
```

Create the bubble near the end of `renderAll()` before appending `flowModal`:

```ts
const tutorialBubble = document.createElement("div");
tutorialBubble.className = "layout-task-tutorial-bubble";
tutorialBubble.hidden = true;

const tutorialMessage = document.createElement("p");
tutorialMessage.className = "layout-task-tutorial-message";
tutorialBubble.append(tutorialMessage);

shell.append(tutorialBubble);
this.refs.tutorialBubbleElement = tutorialBubble;
this.refs.tutorialBubbleMessageElement = tutorialMessage;
```

- [ ] **Step 2: Add renderer methods**

Add methods to `LayoutTaskRenderer`:

```ts
showTutorialStep(step: { anchor: string; message: string }): void {
  const bubble = this.refs.tutorialBubbleElement;
  const message = this.refs.tutorialBubbleMessageElement;
  if (!bubble || !message) {
    return;
  }

  message.textContent = step.message;
  bubble.hidden = false;
  bubble.dataset.anchor = step.anchor;
}

hideTutorialStep(): void {
  if (this.refs.tutorialBubbleElement) {
    this.refs.tutorialBubbleElement.hidden = true;
  }
}
```

- [ ] **Step 3: Add CSS**

Append to `src/styles/layout-task.css`:

```css
.layout-task-tutorial-bubble {
  position: fixed;
  z-index: 50;
  top: 16px;
  left: 50%;
  width: min(560px, calc(100vw - 32px));
  transform: translateX(-50%);
  padding: 14px 16px;
  border: 1px solid rgba(14, 116, 144, 0.35);
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  color: #0f172a;
}

.layout-task-tutorial-message {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
}
```

- [ ] **Step 4: Run renderer tests**

Run:

```bash
npm test -- src/core/renderer.test.ts
```

Expected: PASS.

---

### Task 4: Wire Tutorial Events Into The Player

**Files:**
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/interaction-controller.ts`
- Modify: `src/core/completion-controller.ts`
- Modify: `src/core/layout-task-player.test.ts`
- Modify: `src/core/interaction-controller.test.ts`

- [ ] **Step 1: Add controller to player**

In `src/core/layout-task-player.ts`, import:

```ts
import { TutorialController } from "./tutorial-controller";
```

Inside `createLayoutTaskPlayer`, add:

```ts
let tutorial: TutorialController | undefined;

const showTutorial = () => {
  if (!tutorial) {
    return;
  }
  renderer.showTutorialStep(tutorial.getCurrentStep());
};

const advanceTutorial = (event: Parameters<TutorialController["handle"]>[0], payload?: { objectId?: string }) => {
  if (!tutorial) {
    return;
  }
  if (tutorial.handle(event, payload)) {
    showTutorial();
  }
};
```

In `start()`, after `renderer.mount()`:

```ts
if (options.tutorialMode) {
  tutorial = new TutorialController();
  showTutorial();
}
```

In `showPreviewAcknowledgement` wiring, the existing flow modal acknowledgement is inside `FlowController`. Do not rewrite `FlowController`; instead pass an optional callback into `FlowController`:

```ts
onPreviewAcknowledged: () => advanceTutorial("preview_acknowledged"),
```

In `onReconstructionStart`, add:

```ts
advanceTutorial("reconstruction_started");
```

- [ ] **Step 2: Extend flow controller option**

In `src/core/flow-controller.ts`, add optional option:

```ts
onPreviewAcknowledged?: () => void;
```

Immediately after `await renderer.showPreviewAcknowledgement(...)`, call:

```ts
this.options.onPreviewAcknowledged?.();
```

- [ ] **Step 3: Add tutorial callbacks to interaction**

In `src/core/interaction-controller.ts`, extend options:

```ts
tutorial?: {
  onObjectSelected(objectId: string): void;
  onObjectAction(objectId: string): void;
  onObjectDeselected(objectId: string): void;
};
```

After successful object activation in `selectObject()`:

```ts
this.options.tutorial?.onObjectSelected(objectId);
```

After a successful button action in `requestAction()`:

```ts
this.options.tutorial?.onObjectAction(request.objectId);
```

After successful deselect in `deselectObject()`:

```ts
this.options.tutorial?.onObjectDeselected(previousObjectId);
```

For drag mode, after a successful drag end in `requestDragEnd()`:

```ts
this.options.tutorial?.onObjectAction(request.objectId);
```

- [ ] **Step 4: Wire confidence choice**

In `src/core/layout-task-player.ts`, update the renderer confidence `onChoose` callback:

```ts
onChoose: (value) => {
  const before = confidence?.getActiveGroupId();
  confidence?.choose(value);
  advanceTutorial(before === "chair_group" ? "confidence_chosen" : "second_confidence_chosen");
},
```

If the demo object ids/groups change later, replace the group-specific branch with controller state. For the current demo, this is acceptable and keeps v1 small.

- [ ] **Step 5: Wire submit**

In the `onComplete` wrapper passed into `CompletionController`, call:

```ts
advanceTutorial("submitted");
options.onComplete?.(payload);
```

Use this wrapper instead of passing `options.onComplete` directly.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- src/core/tutorial-controller.test.ts src/core/interaction-controller.test.ts src/core/flow-controller.test.ts src/core/layout-task-player.test.ts
```

Expected: PASS.

---

### Task 5: Finish Documentation

**Files:**
- Modify: `README.md`
- Modify: `protocol/player-ingestion.md`
- Modify: `public/experiment/README.md`

- [ ] **Step 1: Add README experiment runner section**

Add a section to `README.md`:

```md
## Experiment Runner

The standalone player runs one LayoutTask task. The experiment runner runs a complete static jsPsych sequence:

```text
tutorial -> formal preview/reconstruction trials -> final CSV/DataPipe save
```

Open the demo locally:

```bash
pixi run serve-local
```

Then visit:

```text
http://127.0.0.1:5173/experiment/
```

The experiment-level `experiment.json` owns:

- fixed trial order
- tutorial task id
- confidence scale and labels
- participant/session level save settings
- formal trial list

Each formal trial remains a normal LayoutTask task and should use:

```json
{
  "flow": { "mode": "preview_then_reconstruct" },
  "display_image": { "enabled": true, "src": "..." }
}
```

Confidence is recorded by furniture group. A group requires confidence when it contains at least one `role: "variable"` object. If `group_id` is missing, the object id is used as the confidence key.

Final CSV columns:

```csv
participant_id,session_id,experiment_id,start_time,end_time,n_trials,tutorial_completed,tutorial_duration_ms,trial_order_json,trial_results_json
```

Run preflight before deployment:

```bash
pixi run validate-experiment-package public/experiment
```
```

- [ ] **Step 2: Add protocol ingestion section**

Add to `protocol/player-ingestion.md`:

```md
## Experiment-Level Package

Rhino/generator output should produce a deployable experiment folder:

```text
experiment.json
layout-task/manifest.json
layout-task/tasks/*.json
layout-task/assets/**
layout-task/behaviors/*.json
layout-task/scoring/scoring-reference.json
```

Responsibilities are split:

- `experiment.json`: tutorial, fixed order, confidence scale, participant-level save.
- `manifest.json` and `tasks/*.json`: geometry, assets, display image, flow mode, roles, groups, collision, movement.
- `scoring/scoring-reference.json`: target states used by scoring and runtime package validation.

Formal trials should use `preview_then_reconstruct` and enabled `display_image.src`.
Use `pixi run validate-experiment-package <folder>` before publishing to GitHub Pages.
```

- [ ] **Step 3: Update demo README**

Ensure `public/experiment/README.md` includes both local and GitHub Pages URLs:

```md
Local:

```text
http://127.0.0.1:5173/experiment/
```

GitHub Pages:

```text
https://eastnoob.github.io/LayoutTask_Player/experiment/
```
```

- [ ] **Step 4: Run docs-adjacent tests**

Run:

```bash
npm test -- src/schemas/experiment.schema.test.ts tools/generator/validate-experiment-package.test.ts
```

Expected: PASS.

---

### Task 6: Full Verification

**Files:**
- No source edits unless verification exposes a concrete bug.

- [ ] **Step 1: Validate demo package**

Run:

```bash
pixi run validate-experiment-package public/experiment
```

Expected: `"ok": true`.

- [ ] **Step 2: Run full tests**

Run:

```bash
pixi run test
```

Expected: all Vitest tests pass.

- [ ] **Step 3: Run build**

Run:

```bash
pixi run build
```

Expected: `tsc && vite build` exits 0.

- [ ] **Step 4: Check tracked changes**

Run:

```bash
jj status
```

Expected: only intentional feature files and docs are listed. Generated local output directories outside `public/experiment` must not be tracked.

---

### Task 7: Local Browser Smoke

**Files:**
- No source edits unless browser smoke exposes a concrete bug.

- [ ] **Step 1: Start local static server**

Run:

```bash
pixi run serve-local
```

Expected: Vite preview serves at:

```text
http://127.0.0.1:5173/
```

- [ ] **Step 2: Open experiment page**

Open:

```text
http://127.0.0.1:5173/experiment/
```

Expected:

- Tutorial starts first.
- Preview instruction modal appears before timer starts.
- Preview image appears.
- Reconstruction stage is hidden during preview.
- Reconstruction stage appears after preview.
- Tutorial bubble appears on top and advances after correct actions.
- Selecting a furniture group shows confidence controls.
- Clicking outside before confidence is blocked.
- Selecting another group before confidence is blocked.
- Re-entering a group clears active confidence and requires a fresh choice.
- Submit is blocked until all variable groups have confidence.
- Final page shows one CSV row.
- `trial_results_json` contains both `encoded` and `result`.
- Each formal `result` contains top-level `confidence`.

- [ ] **Step 3: Fix any smoke failure with the smallest code change**

If a smoke failure appears, isolate whether it is:

- missing asset/path
- flow timing
- confidence gating
- tutorial event advancement
- final CSV collection

Fix only that bug, then re-run Tasks 6 and 7.

---

### Task 8: GitHub Pages Smoke

**Files:**
- No source edits unless deployment exposes a concrete path bug.

- [ ] **Step 1: Confirm GitHub Pages base works**

Because `vite.config.ts` uses:

```ts
base: "./"
```

the built app should work under:

```text
https://eastnoob.github.io/LayoutTask_Player/
```

- [ ] **Step 2: Deploy current build**

Use the repository's existing GitHub Pages workflow or deployment branch. Do not introduce a second deployment system unless the existing one is missing.

- [ ] **Step 3: Open deployed experiment**

Open:

```text
https://eastnoob.github.io/LayoutTask_Player/experiment/
```

Expected: same checklist as local browser smoke.

- [ ] **Step 4: Diagnose deployment-only failures**

If deployment loads but assets are missing, check browser console 404s against:

- `experiment.json`
- `experiment.json` `baseUrl`
- `layout-task/manifest.json`
- task `display_image.src`
- object/background/icon asset paths

Fix paths in the demo package or loader only after confirming the exact failing URL.

---

## Self-Review

Spec coverage:

- Tutorial bubble is now explicitly planned instead of only passing `tutorialMode`.
- Tutorial includes preview explanation, reconstruction, selection, movement/rotation, confidence, deselection, second selection, and submit.
- Confidence rules remain enforced by the existing controller.
- Demo package validation is unblocked by adding scoring reference.
- Local and GitHub Pages smoke are both required before claiming success.

Placeholder scan:

- No task says "implement later" or "add tests" without specific test commands.
- Every remaining file has a concrete purpose.

Type consistency:

- Runtime event names are local to `TutorialController`.
- Existing `tutorialMode`, `confidence`, `flow`, `display_image`, `group_id`, and `confidence` result names remain unchanged.

