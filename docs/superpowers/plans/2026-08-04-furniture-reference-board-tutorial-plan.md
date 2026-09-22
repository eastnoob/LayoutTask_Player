# Furniture Reference Board Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a one-screen, five-column furniture reference board as the first tutorial screen, before any interactive tutorial-room trial or formal trial, using Rhino MCP-captured multi-angle 3D references and the same 2D object SVGs the task uses.

**Architecture:** Keep the existing tutorial entry point and add one small tutorial-board branch to the experiment config. `buildExperimentTimeline()` owns placement: when `tutorial.referenceBoard.enabled` is true, the first timeline item is one static `InstructionsPlugin` reference-board page; if `tutorial.taskId` is also configured, the existing interactive tutorial-room `LayoutTaskPlugin` still runs immediately after the board, followed by the existing tutorial-complete page, then formal trials. Rhino MCP only produces the source captures; the Player only renders and routes the page. No GIFs, no turntable interaction, no changes to `LayoutTaskPlugin`, and no new experiment system.

**Tech Stack:** Rhino MCP, PowerShell, TypeScript, Zod, jsPsych `InstructionsPlugin`, HTML/CSS, Vitest.

---

## File Map

- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\capture_manifest.json`
  - Names the five furniture sets, their source `.3dm` files, and the four capture angles used for each set.

- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\captures\...`
  - Stores the Rhino MCP viewport JPGs for each angle and the final stitched-per-column image assets if we decide to pre-compose them.

- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\docs\superpowers\checks\2026-08-04-furniture-reference-board-capture-log.md`
  - Short capture log: file mapping, camera recipe, and any manual fixes.

- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\types\experiment.ts`
  - Add tutorial reference-board config types.

- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\schemas\experiment.schema.ts`
  - Validate the new tutorial reference-board shape.

- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\experiment.json`
  - Enable the tutorial board and point it at the shared asset paths.

- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\experiment-runner.ts`
  - Insert the static tutorial board page before formal trials when enabled.

- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\experiment-runner.test.ts`
  - Cover the new tutorial-board timeline and keep the old fallback path.

- Create: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\core\tutorial-reference-board.ts`
  - Build the HTML string for the one-page reference board.

- Create: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\core\tutorial-reference-board.test.ts`
  - Assert the board page contains five columns, the right asset paths, and one Continue button.

- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\styles\layout-task.css`
  - Add the board layout rules so the page stays one screen tall at desktop size.

- Copy from `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\layouttask_source_first5\processing\layouttask-compiled\assets\objects\` to `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\layout-task\assets\objects\`:
  - `m01_group.svg`, `m01_variable.svg`
  - `m02_group.svg`, `m02_variable.svg`
  - `m03_group.svg`, `m03_variable.svg`
  - `m04_group.svg`, `m04_variable.svg`
  - `m05_group.svg`, `m05_variable.svg`
  - Reuse this exact compiled first-five object source. Do not mix these board SVGs with the current Player demo `chair_a/table_a` assets.

- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\layout-task\assets\objects.json`
  - Ensure it exposes `m01_group` through `m05_variable` from the same compiled first-five source, with the same dimensions the formal task package uses.

- Create: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\layout-task\assets\tutorial-reference\...`
  - Store the Rhino MCP capture outputs used by the tutorial board.

---

## Current LayoutTask Constraints

- `src\experiment-runner.ts` is the right insertion point. `LayoutTaskPlugin` only owns a single interactive layout task trial and should not know about the reference board.
- `src\core\config-loader.ts` resolves task assets with `new URL(relativePath, baseUrl)`. The tutorial-board helper must do the same for its `<img src>`, because raw `assets/...` URLs can resolve against the browser page instead of `public\experiment\layout-task\`.
- The current Player demo package uses `chair_a` and `table_a`. The furniture board must be paired with the compiled first-five package assets from `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\layouttask_source_first5\processing\layouttask-compiled\`. Do not claim the board uses the same task assets until `objects.json` and the formal task package point at the same `m01..m05` SVGs.
- This board is part of the tutorial, not a replacement for the interactive tutorial-room trial. Expected timeline when all tutorial fields are configured: reference board -> interactive tutorial room -> tutorial complete page -> formal trials.

---

### Task 1: Capture the 3D Reference Set with Rhino MCP

**Files:**
- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\capture_manifest.json`
- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\captures\m01\...`
- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\captures\m02\...`
- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\captures\m03\...`
- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\captures\m04\...`
- Create: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\captures\m05\...`

- [ ] **Step 1: Lock the mapping from `m01..m05` to the five `.3dm` files**

Start from the alphabetical 3DM list in `stimuli\funitures\group_instance_replaced`:

```text
armchairAndTeatable.3dm
bedsideTable3.3dm
dining tablle.3dm
shortBookcase.3dm
sofaAndTeatable.3dm
```

Write `capture_manifest.json` with one entry per set:

```json
{
  "sets": [
    { "id": "m01", "source": "armchairAndTeatable.3dm" },
    { "id": "m02", "source": "bedsideTable3.3dm" },
    { "id": "m03", "source": "dining tablle.3dm" },
    { "id": "m04", "source": "shortBookcase.3dm" },
    { "id": "m05", "source": "sofaAndTeatable.3dm" }
  ]
}
```

If the visual content does not match this order, only edit this manifest, not the later Player code.

- [ ] **Step 2: Use Rhino MCP to inspect each model and compute a shared camera recipe**

For each `.3dm`, run `mcp__rhino.open_doc` with `clearFirst: true`, then `mcp__rhino.run_python` to print the bounding box and center. Use the same capture recipe for all five sets:

```python
box_min = (min_x, min_y, min_z)
box_max = (max_x, max_y, max_z)
center = ((min_x + max_x) / 2, (min_y + max_y) / 2, (min_z + max_z) / 2)
d = max(max_x - min_x, max_y - min_y, max_z - min_z) * 1.8

views = [
    ("front",  (center[0] + d, center[1] - d, center[2] + 0.9 * d)),
    ("left",   (center[0] - d, center[1] - d, center[2] + 0.9 * d)),
    ("right",  (center[0] + d, center[1] + d, center[2] + 0.9 * d)),
    ("top",    (center[0],     center[1],     center[2] + 2.5 * d)),
]
```

Use `mcp__rhino.get_viewport_image` four times per set with the same display mode, the same target, and the same image size. Keep the output consistent; if one angle clips or hides the shape, rerun only that angle with a slightly larger distance.

- [ ] **Step 3: Save the captures as static assets, not as a GIF**

Write the four JPGs per set under `public\experiment\layout-task\assets\tutorial-reference\` using names like:

```text
m01_front.jpg
m01_left.jpg
m01_right.jpg
m01_top.jpg
```

Do not create an animated GIF. The board will use the four static views as the contact sheet.

- [ ] **Step 4: Record the capture log**

Add a short log file with the source file, the four camera positions, and the MCP metadata returned by each capture. If any capture shows zero visible objects or an off-center framing, repeat that shot before moving on.

---

### Task 2: Add Tutorial Reference-Board Config Support

**Files:**
- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\types\experiment.ts`
- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\schemas\experiment.schema.ts`
- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\experiment.json`
- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\layout-task\assets\objects.json`
- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\schemas\experiment.schema.test.ts`

- [ ] **Step 1: Add a schema test for the new tutorial board**

Add a test case like this:

```ts
it("accepts a tutorial reference board with five items", () => {
  const input = baseExperiment();
  input.tutorial = {
    enabled: true,
    referenceBoard: {
      enabled: true,
      continueLabel: "Continue",
      items: [
        {
          id: "m01",
          front: "assets/tutorial-reference/m01_front.jpg",
          left: "assets/tutorial-reference/m01_left.jpg",
          right: "assets/tutorial-reference/m01_right.jpg",
          top: "assets/tutorial-reference/m01_top.jpg",
          groupSvg: "assets/objects/m01_group.svg",
          variableSvg: "assets/objects/m01_variable.svg",
        },
        {
          id: "m02",
          front: "assets/tutorial-reference/m02_front.jpg",
          left: "assets/tutorial-reference/m02_left.jpg",
          right: "assets/tutorial-reference/m02_right.jpg",
          top: "assets/tutorial-reference/m02_top.jpg",
          groupSvg: "assets/objects/m02_group.svg",
          variableSvg: "assets/objects/m02_variable.svg",
        },
        {
          id: "m03",
          front: "assets/tutorial-reference/m03_front.jpg",
          left: "assets/tutorial-reference/m03_left.jpg",
          right: "assets/tutorial-reference/m03_right.jpg",
          top: "assets/tutorial-reference/m03_top.jpg",
          groupSvg: "assets/objects/m03_group.svg",
          variableSvg: "assets/objects/m03_variable.svg",
        },
        {
          id: "m04",
          front: "assets/tutorial-reference/m04_front.jpg",
          left: "assets/tutorial-reference/m04_left.jpg",
          right: "assets/tutorial-reference/m04_right.jpg",
          top: "assets/tutorial-reference/m04_top.jpg",
          groupSvg: "assets/objects/m04_group.svg",
          variableSvg: "assets/objects/m04_variable.svg",
        },
        {
          id: "m05",
          front: "assets/tutorial-reference/m05_front.jpg",
          left: "assets/tutorial-reference/m05_left.jpg",
          right: "assets/tutorial-reference/m05_right.jpg",
          top: "assets/tutorial-reference/m05_top.jpg",
          groupSvg: "assets/objects/m05_group.svg",
          variableSvg: "assets/objects/m05_variable.svg",
        },
      ],
    },
  };

  expect(parseExperimentConfig(input).tutorial.referenceBoard?.items).toHaveLength(5);
});
```

- [ ] **Step 2: Extend the tutorial config type**

Add the minimal tutorial-board shape:

```ts
export interface ExperimentTutorialReferenceBoardItem {
  id: string;
  front: string;
  left: string;
  right: string;
  top: string;
  groupSvg: string;
  variableSvg: string;
}

export interface ExperimentTutorialReferenceBoardConfig {
  enabled: boolean;
  continueLabel?: string;
  items: ExperimentTutorialReferenceBoardItem[];
}

export interface ExperimentTutorialConfig {
  enabled: boolean;
  taskId?: string;
  qid?: string;
  referenceBoard?: ExperimentTutorialReferenceBoardConfig;
}
```

- [ ] **Step 3: Extend the Zod schema**

In `src/schemas/experiment.schema.ts`, add the new nested object and require exactly five items:

```ts
const tutorialReferenceBoardItemSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  left: z.string().min(1),
  right: z.string().min(1),
  top: z.string().min(1),
  groupSvg: z.string().min(1),
  variableSvg: z.string().min(1),
});

const tutorialSchema = z
  .object({
    enabled: z.boolean().default(false),
    taskId: z.string().min(1).optional(),
    qid: z.string().min(1).optional(),
    referenceBoard: z
      .object({
        enabled: z.boolean().default(false),
        continueLabel: z.string().min(1).default("Continue"),
        items: z.array(tutorialReferenceBoardItemSchema).length(5),
      })
      .optional(),
  })
  .default({ enabled: false });
```

- [ ] **Step 4: Copy the canonical first-five 2D SVG assets into the Player package**

Run:

```powershell
cd D:\PROJECTS\web\LayoutTask\LayoutTask_Player
Copy-Item 'D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\layouttask_source_first5\processing\layouttask-compiled\assets\objects\m0*_*.svg' 'D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\layout-task\assets\objects\'
Copy-Item 'D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\layouttask_source_first5\processing\layouttask-compiled\assets\objects.json' 'D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\layout-task\assets\objects.json'
```

Expected: `public\experiment\layout-task\assets\objects.json` now contains `m01_group`, `m01_variable`, ... `m05_group`, `m05_variable`. If formal trials still use the demo `chair_a/table_a` package, stop here and switch/copy the formal first-five `manifest.json`, `tasks\...`, `behaviors\...`, `assets\backgrounds...`, and `assets\images\stimulus\...` package before claiming the tutorial board uses the same task assets.

- [ ] **Step 5: Update `public/experiment/experiment.json`**

Add a tutorial board block that points at the captured assets:

```json
"tutorial": {
  "enabled": true,
  "taskId": "tutorial_room",
  "qid": "QTUTORIAL",
  "referenceBoard": {
    "enabled": true,
    "continueLabel": "Continue",
    "items": [
      {
        "id": "m01",
        "front": "assets/tutorial-reference/m01_front.jpg",
        "left": "assets/tutorial-reference/m01_left.jpg",
        "right": "assets/tutorial-reference/m01_right.jpg",
        "top": "assets/tutorial-reference/m01_top.jpg",
        "groupSvg": "assets/objects/m01_group.svg",
        "variableSvg": "assets/objects/m01_variable.svg"
      },
      {
        "id": "m02",
        "front": "assets/tutorial-reference/m02_front.jpg",
        "left": "assets/tutorial-reference/m02_left.jpg",
        "right": "assets/tutorial-reference/m02_right.jpg",
        "top": "assets/tutorial-reference/m02_top.jpg",
        "groupSvg": "assets/objects/m02_group.svg",
        "variableSvg": "assets/objects/m02_variable.svg"
      },
      {
        "id": "m03",
        "front": "assets/tutorial-reference/m03_front.jpg",
        "left": "assets/tutorial-reference/m03_left.jpg",
        "right": "assets/tutorial-reference/m03_right.jpg",
        "top": "assets/tutorial-reference/m03_top.jpg",
        "groupSvg": "assets/objects/m03_group.svg",
        "variableSvg": "assets/objects/m03_variable.svg"
      },
      {
        "id": "m04",
        "front": "assets/tutorial-reference/m04_front.jpg",
        "left": "assets/tutorial-reference/m04_left.jpg",
        "right": "assets/tutorial-reference/m04_right.jpg",
        "top": "assets/tutorial-reference/m04_top.jpg",
        "groupSvg": "assets/objects/m04_group.svg",
        "variableSvg": "assets/objects/m04_variable.svg"
      },
      {
        "id": "m05",
        "front": "assets/tutorial-reference/m05_front.jpg",
        "left": "assets/tutorial-reference/m05_left.jpg",
        "right": "assets/tutorial-reference/m05_right.jpg",
        "top": "assets/tutorial-reference/m05_top.jpg",
        "groupSvg": "assets/objects/m05_group.svg",
        "variableSvg": "assets/objects/m05_variable.svg"
      }
    ]
  }
}
```

Keep `taskId` and `qid` when the board should be followed by the existing interactive tutorial-room trial. Remove them only for an intentionally board-only tutorial.

- [ ] **Step 6: Run the schema test**

Run:

```powershell
cd D:\PROJECTS\web\LayoutTask\LayoutTask_Player
npm test -- src/schemas/experiment.schema.test.ts
```

Expected: the new reference-board case passes and the existing defaults still pass.

---

### Task 3: Render the One-Page Tutorial Board

**Files:**
- Create: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\core\tutorial-reference-board.ts`
- Create: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\core\tutorial-reference-board.test.ts`
- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\experiment-runner.ts`
- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\experiment-runner.test.ts`
- Modify: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\src\styles\layout-task.css`

- [ ] **Step 1: Write the board-page helper**

Create a helper that returns one HTML string and nothing else:

```ts
export function buildTutorialReferenceBoardPage(input: {
  baseUrl: string;
  board: ExperimentTutorialReferenceBoardConfig;
}): string
```

The page should:

```html
<section class="layout-task-shell layout-task-tutorial-board-shell">
  <div class="layout-task-tutorial-board-grid">
    <article class="layout-task-tutorial-board-column">
      <div class="layout-task-tutorial-board-contact-sheet">
        <img ... />
        <img ... />
        <img ... />
        <img ... />
      </div>
      <div class="layout-task-tutorial-board-two-d">
        <img ... />
        <img ... />
      </div>
    </article>
    ...
  </div>
</section>
```

Resolve every image URL the same way `ConfigLoader` resolves task assets:

```ts
const assetUrl = (path: string) => new URL(path, input.baseUrl).toString();
```

Use `assetUrl(item.front)`, `assetUrl(item.groupSvg)`, and so on for all `<img src>` values. Do not render visible numbering or explanatory prose. The only visible button text should be the Continue button label from config.

- [ ] **Step 2: Add the layout rules**

In `src/styles/layout-task.css`, add a single-screen grid:

```css
.layout-task-tutorial-board-shell {
  width: 100%;
}

.layout-task-tutorial-board-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  align-items: start;
}

.layout-task-tutorial-board-column {
  min-width: 0;
  display: grid;
  gap: 6px;
}

.layout-task-tutorial-board-contact-sheet {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  aspect-ratio: 1 / 1;
}

.layout-task-tutorial-board-two-d {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  aspect-ratio: 2 / 1;
}

.layout-task-tutorial-board-contact-sheet img,
.layout-task-tutorial-board-two-d img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
```

Tune only spacing and aspect ratios if the 1920x1080 screenshot still feels cramped.

- [ ] **Step 3: Route the tutorial board through `experiment-runner.ts`**

Add the reference-board page as the first jsPsych timeline item when `tutorial.referenceBoard.enabled` is true. Keep the existing interactive tutorial-room trial after the board when `tutorial.taskId` is configured:

```ts
if (config.tutorial.enabled) {
  if (config.tutorial.referenceBoard?.enabled) {
    timeline.push({
      type: InstructionsPlugin,
      pages: [buildTutorialReferenceBoardPage({ baseUrl: config.baseUrl, board: config.tutorial.referenceBoard })],
      show_clickable_nav: true,
      button_label_next: config.tutorial.referenceBoard.continueLabel ?? "Continue",
      data: { tutorial: true, tutorial_reference_board: true },
    });
  }

  if (config.tutorial.taskId) {
    timeline.push({
      type: LayoutTaskPlugin,
      baseUrl: config.baseUrl,
      taskId: config.tutorial.taskId,
      qid: config.tutorial.qid,
      tutorialMode: true,
      confidence: config.confidence,
      autoFinishTrial: true,
      writeEncodedToData: false,
      writeResultToData: false,
      writeHeaderToData: true,
      data: { tutorial: true },
    });
    timeline.push({
      type: InstructionsPlugin,
      pages: [
        "<h1>Tutorial complete.</h1><pre>Study image -> Reconstruct scene -> Rate confidence -> Submit</pre><p>The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.</p>",
      ],
      show_clickable_nav: true,
      button_label_next: "Start formal experiment",
    });
  }
}
```

Do not add a second tutorial branch in `LayoutTaskPlugin`. Timeline ordering lives only in `buildExperimentTimeline()`.

- [ ] **Step 4: Update the runner test**

Add a test that asserts the first timeline item is the board page, followed by the existing interactive tutorial-room trial, then the existing tutorial-complete page, then the first formal trial:

```ts
expect(timeline[0]).toMatchObject({
  type: InstructionsPlugin,
  button_label_next: "Continue",
});
expect(String(timeline[0].pages[0])).toContain("/layout-task-generated/assets/tutorial-reference/m01_front.jpg");
expect(String(timeline[0].pages[0])).toContain("/layout-task-generated/assets/objects/m01_group.svg");
expect(timeline[1]).toMatchObject({ type: LayoutTaskPlugin, taskId: "tutorial_room", tutorialMode: true });
expect(timeline[2]).toMatchObject({ button_label_next: "Start formal experiment" });
expect(timeline[3]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001" });
```

Also keep one legacy test that shows the old tutorial-room flow still works when `referenceBoard` is omitted, and add one small board-only test where `tutorial.taskId` is absent and the first formal trial follows the board.

- [ ] **Step 5: Run the runner and helper tests**

Run:

```powershell
cd D:\PROJECTS\web\LayoutTask\LayoutTask_Player
npm test -- src/core/tutorial-reference-board.test.ts src/experiment-runner.test.ts
```

Expected: the board helper test passes, the board-first tutorial timeline test passes, the board-only timeline test passes, and the old no-board tutorial path still passes.

---

### Task 4: Verify the Board Fits and the Assets Are Correct

**Files:**
- Read: `D:\PROJECTS\RhinoGH\IsPictureEnough\stimuli\tutorial_reference_board\captures\...`
- Read: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\experiment.json`
- Read: `D:\PROJECTS\web\LayoutTask\LayoutTask_Player\public\experiment\layout-task\assets\objects\m01_group.svg` through `m05_variable.svg`

- [ ] **Step 1: Run the unit tests that cover the new flow**

Run:

```powershell
cd D:\PROJECTS\web\LayoutTask\LayoutTask_Player
npm test
```

Expected: the full Player suite passes, including the new tutorial-board and schema tests.

- [ ] **Step 2: Build the Player**

Run:

```powershell
cd D:\PROJECTS\web\LayoutTask\LayoutTask_Player
npm run build
```

Expected: the build succeeds with the new HTML helper and CSS classes.

- [ ] **Step 3: Open the experiment in a browser and check the first page**

Run the dev server, open the experiment page, and verify at 1920x1080 that:

1. All five columns are visible on one screen.
2. The 3D captures are readable without scrolling.
3. The 2D group and variable SVGs are the same assets used by the task.
4. The only action on the tutorial board is Continue.
5. Clicking Continue moves to the existing interactive tutorial-room trial when `tutorial.taskId` is configured, not directly to the first formal trial.

If the page spills, reduce spacing first. Only shrink the board after spacing has been cut.

- [ ] **Step 4: Re-run any failed MCP captures**

If any 3D capture is clipped or off-center, rerun only that angle with the same camera recipe. Do not add a GIF or a new capture mode.

---

## Grill-Me Self-Check

- Question: Does this teach the right thing?
  Answer: Yes. It shows the furniture group shape, the variable shape, and the shared 2D assets as the first tutorial screen before any interactive tutorial or formal trial.

- Question: Is the tutorial actually one page?
  Answer: The reference board itself is one static `InstructionsPlugin` page with a single Continue button. It is followed by the existing interactive tutorial-room trial when `tutorial.taskId` is configured.

- Question: Are we reusing the real task assets?
  Answer: Yes, but only after the formal task package and Player `objects.json` are switched to the same compiled first-five `m01..m05` SVG source. The plan now blocks on that check instead of mixing board furniture with the demo `chair_a/table_a` task.

- Question: Did we overbuild with GIFs or extra flows?
  Answer: No. The 3D side is four static MCP captures per set, arranged as a contact sheet in the board.

- Question: Does this preserve the old tutorial path?
  Answer: Yes. The old tutorial-room `LayoutTaskPlugin` still runs after the reference board when `tutorial.taskId` is configured, and the old no-board path still works when `referenceBoard` is not enabled.

- Question: Can the plan be executed in small steps?
  Answer: Yes. Capture assets first, then schema, then board rendering, then verification.
