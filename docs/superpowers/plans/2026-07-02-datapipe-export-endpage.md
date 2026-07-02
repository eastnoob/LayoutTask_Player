# DataPipe Export End Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save flat DataPipe CSV files for session/results/events, then show a final English completion page with a close button.

**Architecture:** Keep the existing jsPsych experiment runner. Add flat CSV generation in `src/core/experiment-data.ts`, loop over the generated files in `src/experiment-runner.ts`, and update the public experiment config to use the provided DataPipe experiment id. Do not add the jsPsych Pipe CDN; the current direct DataPipe API save is enough.

**Tech Stack:** TypeScript, jsPsych, Vitest, Vite, DataPipe HTTP API.

---

## File Map

- Modify `src/core/experiment-data.ts`: create three flat CSV files and DataPipe payloads.
- Modify `src/core/experiment-data.test.ts`: cover filenames, flat rows, blank cells, and event rows.
- Modify `src/experiment-runner.ts`: add the tutorial ASCII diagram, save all CSV files, and render final success/failure page with `Close page`.
- Modify `src/experiment-runner.test.ts`: cover timeline page text, multiple DataPipe posts, and close-page markup.
- Modify `public/experiment/experiment.json`: switch demo package to DataPipe id `mshCnq690sD5`.

---

### Task 1: Generate Flat CSV Files

**Files:**
- Modify: `src/core/experiment-data.test.ts`
- Modify: `src/core/experiment-data.ts`

- [ ] **Step 1: Replace the old one-row JSON CSV test with flat-file tests**

In `src/core/experiment-data.test.ts`, keep participant/session id tests. Replace the `experiment data export` describe block with tests shaped like this:

```ts
import {
  createExperimentCsvFiles,
  createExperimentDataPipePayloads,
  createExperimentFilename,
} from "./experiment-data";

describe("experiment data export", () => {
  const result = {
    schema: "layouttask.result.v1",
    exp: "layout_task_v1",
    qid: "Q001",
    task_id: "scene_001",
    session: "trial-session",
    start_time: 100,
    end_time: 900,
    duration_ms: 800,
    flow: { mode: "preview_then_reconstruct", preview_duration_ms: 10000 },
    task_config_hash: "abc123",
    confidence: { group_a: 4 },
    context: {
      world: {
        unit: "px",
        viewBox: { x: 0, y: 0, width: 1000, height: 1000 },
        origin: { x: 0, y: 0 },
        grid_size: 50,
        grid_snap: true,
      },
      objects: {
        group_a: {
          origin: { x: 100, y: 200, r: 90 },
          movement_step: 50,
          rotation_step: 45,
          limits: {},
        },
      },
    },
    events: [
      {
        i: 0,
        t: 12,
        object: "group_a",
        action: "move_right",
        valid: true,
        before: { x: 100, y: 200, r: 90 },
        after: { x: 150, y: 200, r: 90 },
        offsets: { xSteps: 1, ySteps: 0, rotationSteps: 0 },
      },
    ],
    final_state_mode: "absolute",
    final_state: {
      group_a: {
        x: 150,
        y: 200,
        r: 90,
        counts: { left: 0, right: 1, up: 0, down: 0, cw: 0, ccw: 0 },
        offsets: { xSteps: 1, ySteps: 0, rotationSteps: 0 },
      },
    },
    locked: true,
    user_agent: "TestBrowser",
    display: {
      viewport: { width: 1200, height: 800 },
      screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
      devicePixelRatio: 1,
    },
  } as const;

  const input = {
    participantId: "P001",
    sessionId: "S001",
    experimentId: "layout_task_v1",
    startTime: 1000,
    endTime: 3000,
    tutorialCompleted: true,
    tutorialDurationMs: 500,
    trialOrder: ["scene_001"],
    trialResults: [
      {
        taskId: "scene_001",
        qid: "Q001",
        encoded: "LAYOUTTASK1|Q001|...",
        hash8: "deadbeef",
        result,
      },
    ],
  };

  it("builds session, results, and events CSV files", () => {
    const files = createExperimentCsvFiles(input);

    expect(files.map((file) => file.filename)).toEqual([
      "layout_session_P001_S001.csv",
      "layout_results_P001_S001.csv",
      "layout_events_P001_S001.csv",
    ]);
    expect(files[0].data).toContain("participant_id,session_id,experiment_id,started_at,ended_at,duration_ms");
    expect(files[0].data).toContain("P001,S001,layout_task_v1,1000,3000,2000");
    expect(files[1].data).toContain("trial_index,task_id,qid,object_id,confidence");
    expect(files[1].data).toContain("0,scene_001,Q001,group_a,4");
    expect(files[1].data).toContain("100,200,90,50,45,150,200,90,1,0,0");
    expect(files[2].data).toContain("event_index,event_time_ms,object_id,action,valid");
    expect(files[2].data).toContain("0,12,group_a,move_right,true");
  });

  it("builds one DataPipe payload per CSV file", () => {
    expect(createExperimentFilename("layout_results", "P 001", "S/001")).toBe("layout_results_P-001_S-001.csv");

    const payloads = createExperimentDataPipePayloads({
      experimentId: "mshCnq690sD5",
      files: createExperimentCsvFiles(input),
    });

    expect(payloads.map((payload) => payload.filename)).toEqual([
      "layout_session_P001_S001.csv",
      "layout_results_P001_S001.csv",
      "layout_events_P001_S001.csv",
    ]);
    expect(payloads.every((payload) => payload.experimentID === "mshCnq690sD5")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pixi run test src/core/experiment-data.test.ts
```

Expected: FAIL because `createExperimentCsvFiles` and `createExperimentDataPipePayloads` do not exist yet.

- [ ] **Step 3: Implement minimal flat CSV generation**

In `src/core/experiment-data.ts`:

- Add `hash8?: string` to `ExperimentTrialResultItem`.
- Type `result` as `LayoutTaskResult | unknown` by importing `LayoutTaskResult`.
- Add:

```ts
export interface ExperimentCsvFile {
  filename: string;
  data: string;
}

export interface ExperimentDataPipePayloadsInput {
  experimentId: string;
  files: ExperimentCsvFile[];
}
```

Replace the old `createExperimentCsv` usage path with these exported functions:

```ts
export function createExperimentCsvFiles(input: ExperimentCsvInput): ExperimentCsvFile[] {
  return [
    {
      filename: createExperimentFilename("layout_session", input.participantId, input.sessionId),
      data: createSessionCsv(input),
    },
    {
      filename: createExperimentFilename("layout_results", input.participantId, input.sessionId),
      data: createResultsCsv(input),
    },
    {
      filename: createExperimentFilename("layout_events", input.participantId, input.sessionId),
      data: createEventsCsv(input),
    },
  ];
}

export function createExperimentDataPipePayloads(input: ExperimentDataPipePayloadsInput): Array<{
  experimentID: string;
  filename: string;
  data: string;
}> {
  return input.files.map((file) => ({
    experimentID: input.experimentId,
    filename: file.filename,
    data: file.data,
  }));
}
```

Keep `formatCsvCell()` and `sanitizeFilenamePart()`. Implement private helpers:

```ts
function csv(headers: string[], rows: Array<Array<string | number | boolean | undefined>>): string {
  return `${headers.join(",")}\n${rows.map((row) => row.map((value) => formatCsvCell(value ?? "")).join(",")).join("\n")}\n`;
}
```

Use `isLayoutTaskResult(value): value is LayoutTaskResult` checking `value && typeof value === "object" && (value as { schema?: unknown }).schema === "layouttask.result.v1"`.

For final state, support both absolute and relative:

- Absolute object state: read `x/y/r` and `offsets`.
- Relative object state: read `dx_steps/dy_steps/rotation_steps`, leave absolute final cells blank.

- [ ] **Step 4: Run focused test and verify pass**

Run:

```bash
pixi run test src/core/experiment-data.test.ts
```

Expected: PASS.

---

### Task 2: Save All Files And Render Final Page

**Files:**
- Modify: `src/experiment-runner.test.ts`
- Modify: `src/experiment-runner.ts`

- [ ] **Step 1: Update runner tests for diagram and multiple saves**

In `src/experiment-runner.test.ts`:

- Update the tutorial transition assertion to expect the ASCII flow text:

```ts
expect(timeline[1].pages[0]).toContain("Study image -> Reconstruct scene -> Rate confidence -> Submit");
```

- Replace the old `saveExperimentCsv` test import/call with `saveExperimentFiles`.

Add this test:

```ts
describe("saveExperimentFiles", () => {
  it("posts every generated CSV file to DataPipe", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" })) as unknown as typeof fetch;

    const result = await saveExperimentFiles({
      dataSave: experimentConfig().dataSave,
      files: [
        { filename: "layout_session_P001_S001.csv", data: "a\n1\n" },
        { filename: "layout_results_P001_S001.csv", data: "b\n2\n" },
        { filename: "layout_events_P001_S001.csv", data: "c\n3\n" },
      ],
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[1][1].body))).toEqual({
      experimentID: "layout_task_v1",
      filename: "layout_results_P001_S001.csv",
      data: "b\n2\n",
    });
  });
});
```

- [ ] **Step 2: Run focused runner test and verify it fails**

Run:

```bash
pixi run test src/experiment-runner.test.ts
```

Expected: FAIL because `saveExperimentFiles` and the diagram are not implemented.

- [ ] **Step 3: Implement runner changes**

In `src/experiment-runner.ts`:

- Replace imports of `createExperimentCsv` / `createExperimentDataPipePayload` with `createExperimentCsvFiles` / `createExperimentDataPipePayloads`.
- Rename `saveExperimentCsv` to `saveExperimentFiles` with signature:

```ts
export async function saveExperimentFiles(input: {
  dataSave: ExperimentDataSaveConfig;
  files: ExperimentCsvFile[];
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; error?: string; saved: number; failedFilename?: string }> {
```

- For `copy` mode return `{ ok: true, saved: 0 }`.
- For `datapipe` mode, loop through `createExperimentDataPipePayloads({ experimentId: input.dataSave.experimentId, files: input.files })` and POST each payload. Stop on first failure and return filename/error.

Update the tutorial completion page HTML to:

```ts
pages: [
  "<h1>Tutorial complete.</h1><pre>Study image -> Reconstruct scene -> Rate confidence -> Submit</pre><p>The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.</p>",
],
```

In `on_finish`, create files:

```ts
const files = createExperimentCsvFiles({
  participantId,
  sessionId,
  experimentId: config.experimentId,
  startTime,
  endTime: Date.now(),
  tutorialCompleted: Boolean(tutorialRow),
  tutorialDurationMs: Number(tutorialRow?.rt ?? 0),
  trialOrder: config.trials.map((trial) => trial.taskId),
  trialResults,
});
renderEndPage(files, await saveExperimentFiles({ dataSave: config.dataSave, files }));
```

Update `renderEndPage` to accept `files: ExperimentCsvFile[]`. On success, render title text exactly:

```text
Experiment complete. Your data has been saved.
```

Render detail:

```text
You may now close this page.
```

Add a `Close page` button:

```ts
button.textContent = "Close page";
button.addEventListener("click", () => {
  window.close();
  setTimeout(() => {
    detail.textContent = "If this tab did not close automatically, please close it manually.";
  }, 250);
});
```

On failure, render the failure text from the spec and one textarea containing all CSVs separated by:

```text
--- <filename> ---
<csv>
```

- [ ] **Step 4: Run focused runner test and verify pass**

Run:

```bash
pixi run test src/experiment-runner.test.ts
```

Expected: PASS.

---

### Task 3: Enable DataPipe In Demo Config

**Files:**
- Modify: `public/experiment/experiment.json`
- Modify: `src/schemas/experiment.schema.test.ts` if existing tests assert copy defaults only

- [ ] **Step 1: Update public experiment config**

Change `public/experiment/experiment.json`:

```json
"data_save": {
  "mode": "datapipe",
  "experiment_id": "mshCnq690sD5",
  "endpoint": "https://pipe.jspsych.org/api/data/",
  "filename_prefix": "layout-task"
}
```

Note: `filename_prefix` remains accepted for config compatibility, but file names are now fixed as `layout_session_*`, `layout_results_*`, and `layout_events_*`.

- [ ] **Step 2: Run schema tests**

Run:

```bash
pixi run test src/schemas/experiment.schema.test.ts
```

Expected: PASS. If a test expects copy mode for the public package, update only that assertion to expect `datapipe` and `mshCnq690sD5`.

---

### Task 4: Full Verification And Browser Smoke

**Files:**
- No source changes unless verification finds a bug.

- [ ] **Step 1: Run full tests**

Run:

```bash
pixi run test
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

Run:

```bash
pixi run build
```

Expected: build completes and emits `dist/`.

- [ ] **Step 3: Validate experiment package**

Run:

```bash
pixi run validate-experiment-package public/experiment
```

Expected:

```json
{ "ok": true, "failures": [] }
```

- [ ] **Step 4: Browser smoke test with Chrome**

Start the local server:

```bash
pixi run serve-local
```

Open Chrome manually or via automation at:

```text
http://127.0.0.1:5173/experiment/?participant=SMOKE_DATAPIPE
```

Complete the tutorial and two formal trials with any legal moves and confidence ratings. Verify:

- Tutorial completion page shows the ASCII flow.
- Final page says `Experiment complete. Your data has been saved.`
- Close button either closes the tab or shows the manual-close fallback.
- Browser network has three successful POSTs to `https://pipe.jspsych.org/api/data/`.
- POST filenames are `layout_session_*`, `layout_results_*`, and `layout_events_*` with the same participant/session id.

- [ ] **Step 5: Commit**

Use jj:

```bash
jj status
jj commit -m "feat: save experiment csv files to datapipe"
```

If unrelated user edits are present, do not squash or revert them; commit only after confirming the working copy contains the intended feature changes.

---

## Self-Review

- Spec coverage: tutorial ASCII diagram is Task 2; end page is Task 2; three DataPipe files are Tasks 1-2; DataPipe id is Task 3; browser/OSF smoke is Task 4.
- Placeholder scan: no TBD/TODO steps; all changed functions and filenames are named.
- Type consistency: `ExperimentCsvFile`, `createExperimentCsvFiles`, `createExperimentDataPipePayloads`, and `saveExperimentFiles` are introduced before use.
