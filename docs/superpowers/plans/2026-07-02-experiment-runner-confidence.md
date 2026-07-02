# Experiment Runner, Tutorial, Confidence, And Data Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Pages friendly jsPsych experiment runner that runs tutorial -> fixed-order preview/reconstruction trials -> one participant-level CSV/DataPipe save, with required per-furniture-group confidence.

**Architecture:** Keep the existing LayoutTask player as the per-trial engine. Add a thin experiment layer for config loading, participant/session identity, timeline assembly, final CSV save, tutorial guidance, and confidence gating. Confidence is enforced inside the player because it affects selection, deselection, and submit rules.

**Tech Stack:** TypeScript, Vite, jsPsych 8, existing LayoutTask runtime, existing Zod schema style, Vitest, existing `pixi` task conventions, no new runtime dependencies.

---

## File Structure

- Create: `src/types/experiment.ts`
  - Authoring/runtime types for `layouttask.experiment.v1`.
  - Defines tutorial, fixed-order trials, confidence config, and runner-level DataPipe config.
- Create: `src/schemas/experiment.schema.ts`
  - Zod schema and parser for `experiment.json`.
- Create: `src/core/experiment-loader.ts`
  - Loads `experiment.json` from a static base URL.
  - Applies defaults and resolves URL-safe base paths.
- Create: `src/core/participant-session.ts`
  - Reads participant id from URL params or localStorage fallback.
  - Generates session ids with native `crypto.getRandomValues`.
- Create: `src/core/experiment-data.ts`
  - Builds participant-level CSV, DataPipe filename, and DataPipe request body.
- Create: `src/core/experiment-data.test.ts`
  - Unit tests for id parsing, CSV escaping, filename, and payload assembly.
- Create: `src/core/confidence-controller.ts`
  - Pure confidence state model: variable group discovery, enter/leave edit, choose confidence, submit readiness.
- Create: `src/core/confidence-controller.test.ts`
  - Unit tests for all confidence gating rules.
- Modify: `src/types/result.ts`
  - Add optional top-level `confidence?: Record<string, number>`.
- Modify: `src/schemas/result.schema.ts`
  - Validate `confidence` values as integer 1-5.
- Modify: `src/schemas/result.schema.test.ts`
  - Add positive and negative confidence result validation.
- Modify: `src/core/recorder.ts`
  - Accept a `getConfidence()` callback and include final confidence in `LayoutTaskResult`.
- Modify: `src/core/layout-task-player.ts`
  - Instantiate confidence controller when enabled.
  - Pass confidence gates into interaction and completion.
  - Expose minimal tutorial event hooks.
- Modify: `src/core/interaction-controller.ts`
  - Block deselect/switch when confidence is required and not selected for the active group.
  - Notify confidence controller on edit entry and object operation.
- Modify: `src/core/completion-controller.ts`
  - Block submit when confidence requirements are incomplete.
- Modify: `src/core/renderer.ts`
  - Add confidence scale UI and small status copy.
  - Add tutorial bubble anchor hooks with `data-layout-task-anchor`.
- Modify: `src/styles/layout-task.css`
  - Style confidence selector and tutorial overlay bubble.
- Create: `src/core/tutorial-controller.ts`
  - Guided bubble state machine for tutorial steps.
- Create: `src/core/tutorial-controller.test.ts`
  - Pure tests for step advancement.
- Modify: `src/plugins/jspsych-layout-task.ts`
  - Add optional params for confidence and tutorial mode.
  - Include tutorial metadata when requested.
- Modify: `src/plugins/jspsych-layout-task.test.ts`
  - Verify plugin forwards confidence/tutorial params and trial data remains compatible.
- Replace/extend: `src/experiment.ts`
  - Build the real top-level jsPsych timeline from `experiment.json`.
- Create: `src/experiment-runner.ts`
  - Pure timeline/data helper functions for testability.
- Create: `src/experiment-runner.test.ts`
  - Fixed-order timeline and end-save tests.
- Create: `tools/generator/validate-experiment-package.ts`
  - Runner-level preflight for `experiment.json` plus referenced LayoutTask package.
- Create: `tools/generator/validate-experiment-package.test.ts`
  - Tests for missing tutorial, missing formal trial, non-preview flow, missing display image.
- Modify: `pixi.toml`
  - Add `validate-experiment-package`.
- Create or update: `public/experiment/experiment.json`
  - Small demo experiment: tutorial plus two formal preview/reconstruction trials.
- Create or update: `public/experiment/README.md`
  - Manual opening and GitHub Pages notes.
- Modify: `README.md`
  - Add experiment runner, confidence, deployment, and final CSV sections.
- Modify: `protocol/player-ingestion.md`
  - Explain how Rhino/generated packages feed `experiment.json`.

---

### Task 1: Experiment Config Types And Schema

**Files:**
- Create: `src/types/experiment.ts`
- Create: `src/schemas/experiment.schema.ts`
- Create: `src/schemas/experiment.schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `src/schemas/experiment.schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseExperimentConfig } from "./experiment.schema";

function baseExperiment() {
  return {
    schema: "layouttask.experiment.v1",
    experiment_id: "layout_task_v1",
    baseUrl: "/layout-task-generated/",
    order: "fixed",
    tutorial: {
      enabled: true,
      taskId: "tutorial_room",
      qid: "QTUTORIAL",
    },
    confidence: {
      required: true,
      scale: [1, 2, 3, 4, 5],
      labels: {
        "1": "很不确定",
        "2": "不太确定",
        "3": "一般",
        "4": "比较确定",
        "5": "很确定",
      },
    },
    data_save: {
      mode: "datapipe",
      experiment_id: "layout_task_v1",
      endpoint: "https://pipe.jspsych.org/api/data/",
      filename_prefix: "layout-task",
    },
    trials: [
      { taskId: "scene_001", qid: "Q001" },
      { taskId: "scene_002", qid: "Q002" },
    ],
  };
}

describe("parseExperimentConfig", () => {
  it("accepts the v1 experiment config shape", () => {
    expect(parseExperimentConfig(baseExperiment())).toMatchObject({
      schema: "layouttask.experiment.v1",
      experimentId: "layout_task_v1",
      baseUrl: "/layout-task-generated/",
      order: "fixed",
      tutorial: {
        enabled: true,
        taskId: "tutorial_room",
        qid: "QTUTORIAL",
      },
      confidence: {
        required: true,
        scale: [1, 2, 3, 4, 5],
      },
      trials: [
        { taskId: "scene_001", qid: "Q001" },
        { taskId: "scene_002", qid: "Q002" },
      ],
    });
  });

  it("applies defaults for tutorial, confidence, and data save", () => {
    const input = baseExperiment();
    delete (input as any).tutorial;
    delete (input as any).confidence;
    delete (input as any).data_save;

    expect(parseExperimentConfig(input)).toMatchObject({
      tutorial: { enabled: false },
      confidence: {
        required: true,
        scale: [1, 2, 3, 4, 5],
        labels: {
          "1": "很不确定",
          "5": "很确定",
        },
      },
      dataSave: {
        mode: "copy",
        filenamePrefix: "layout-task",
      },
    });
  });

  it("rejects non-fixed order in v1", () => {
    const input = baseExperiment();
    (input as any).order = "random";

    expect(() => parseExperimentConfig(input)).toThrow(/order/i);
  });

  it("rejects invalid confidence scales", () => {
    const input = baseExperiment();
    (input as any).confidence.scale = [0, 1, 2];

    expect(() => parseExperimentConfig(input)).toThrow(/confidence/i);
  });

  it("requires at least one formal trial", () => {
    const input = baseExperiment();
    input.trials = [];

    expect(() => parseExperimentConfig(input)).toThrow(/trials/i);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- src/schemas/experiment.schema.test.ts
```

Expected: FAIL because `src/schemas/experiment.schema.ts` does not exist.

- [ ] **Step 3: Add experiment types**

Create `src/types/experiment.ts`:

```ts
export interface ExperimentTrialRef {
  taskId: string;
  qid?: string;
}

export interface ExperimentTutorialConfig {
  enabled: boolean;
  taskId?: string;
  qid?: string;
}

export interface ExperimentConfidenceConfig {
  required: boolean;
  scale: number[];
  labels: Record<string, string>;
}

export interface ExperimentCopyDataSaveConfig {
  mode: "copy";
  filenamePrefix: string;
}

export interface ExperimentDataPipeSaveConfig {
  mode: "datapipe";
  experimentId: string;
  endpoint: string;
  filenamePrefix: string;
}

export type ExperimentDataSaveConfig = ExperimentCopyDataSaveConfig | ExperimentDataPipeSaveConfig;

export interface ExperimentConfig {
  schema: "layouttask.experiment.v1";
  experimentId: string;
  baseUrl: string;
  order: "fixed";
  tutorial: ExperimentTutorialConfig;
  confidence: ExperimentConfidenceConfig;
  dataSave: ExperimentDataSaveConfig;
  trials: ExperimentTrialRef[];
}
```

- [ ] **Step 4: Add parser schema**

Create `src/schemas/experiment.schema.ts`:

```ts
import { z } from "zod";
import type { ExperimentConfig } from "../types/experiment";

const defaultConfidenceLabels = {
  "1": "很不确定",
  "2": "不太确定",
  "3": "一般",
  "4": "比较确定",
  "5": "很确定",
};

const experimentTrialRefSchema = z.object({
  taskId: z.string().min(1),
  qid: z.string().min(1).optional(),
});

const tutorialSchema = z
  .object({
    enabled: z.boolean().default(false),
    taskId: z.string().min(1).optional(),
    qid: z.string().min(1).optional(),
  })
  .default({ enabled: false });

const confidenceSchema = z
  .object({
    required: z.boolean().default(true),
    scale: z.array(z.number().int().min(1).max(5)).min(1).default([1, 2, 3, 4, 5]),
    labels: z.record(z.string().min(1)).default(defaultConfidenceLabels),
  })
  .default({
    required: true,
    scale: [1, 2, 3, 4, 5],
    labels: defaultConfidenceLabels,
  })
  .superRefine((value, ctx) => {
    const unique = new Set(value.scale);
    if (unique.size !== value.scale.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "confidence scale values must be unique" });
    }
    for (const item of value.scale) {
      if (!value.labels[String(item)]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `confidence label missing for ${item}` });
      }
    }
  });

const dataSaveSchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("copy"),
      filename_prefix: z.string().min(1).default("layout-task"),
    }),
    z.object({
      mode: z.literal("datapipe"),
      experiment_id: z.string().min(1),
      endpoint: z.string().url().default("https://pipe.jspsych.org/api/data/"),
      filename_prefix: z.string().min(1).default("layout-task"),
    }),
  ])
  .default({ mode: "copy", filename_prefix: "layout-task" });

const experimentSchema = z.object({
  schema: z.literal("layouttask.experiment.v1"),
  experiment_id: z.string().min(1),
  baseUrl: z.string().min(1),
  order: z.literal("fixed").default("fixed"),
  tutorial: tutorialSchema,
  confidence: confidenceSchema,
  data_save: dataSaveSchema,
  trials: z.array(experimentTrialRefSchema).min(1),
});

export function parseExperimentConfig(input: unknown): ExperimentConfig {
  const parsed = experimentSchema.parse(input);
  const dataSave =
    parsed.data_save.mode === "datapipe"
      ? {
          mode: "datapipe" as const,
          experimentId: parsed.data_save.experiment_id,
          endpoint: parsed.data_save.endpoint,
          filenamePrefix: parsed.data_save.filename_prefix,
        }
      : {
          mode: "copy" as const,
          filenamePrefix: parsed.data_save.filename_prefix,
        };

  return {
    schema: parsed.schema,
    experimentId: parsed.experiment_id,
    baseUrl: parsed.baseUrl,
    order: parsed.order,
    tutorial: parsed.tutorial,
    confidence: parsed.confidence,
    dataSave,
    trials: parsed.trials,
  };
}
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- src/schemas/experiment.schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/types/experiment.ts src/schemas/experiment.schema.ts src/schemas/experiment.schema.test.ts
git commit -m "feat: add experiment config schema"
```

---

### Task 2: Experiment Loader

**Files:**
- Create: `src/core/experiment-loader.ts`
- Create: `src/core/experiment-loader.test.ts`

- [ ] **Step 1: Write failing loader tests**

Create `src/core/experiment-loader.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ExperimentLoader } from "./experiment-loader";

describe("ExperimentLoader", () => {
  it("loads and parses experiment.json from a static base URL", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        schema: "layouttask.experiment.v1",
        experiment_id: "layout_task_v1",
        baseUrl: "/layout-task-generated/",
        order: "fixed",
        trials: [{ taskId: "scene_001", qid: "Q001" }],
      }),
    })) as unknown as typeof fetch;

    const loader = new ExperimentLoader({ baseUrl: "/experiment/", fetchImpl });
    const config = await loader.load();

    expect(fetchImpl).toHaveBeenCalledWith("http://example.test/experiment/experiment.json");
    expect(config.experimentId).toBe("layout_task_v1");
    expect(config.trials).toEqual([{ taskId: "scene_001", qid: "Q001" }]);
  });

  it("throws a clear load error", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    })) as unknown as typeof fetch;

    const loader = new ExperimentLoader({ baseUrl: "http://example.test/experiment/", fetchImpl });

    await expect(loader.load()).rejects.toThrow("Failed to load experiment.json: 404 Not Found");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- src/core/experiment-loader.test.ts
```

Expected: FAIL because `ExperimentLoader` does not exist.

- [ ] **Step 3: Add loader**

Create `src/core/experiment-loader.ts`:

```ts
import { parseExperimentConfig } from "../schemas/experiment.schema";
import type { ExperimentConfig } from "../types/experiment";

export interface ExperimentLoaderOptions {
  baseUrl: string;
  configPath?: string;
  fetchImpl?: typeof fetch;
}

export class ExperimentLoader {
  private readonly baseUrl: string;
  private readonly configPath: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ExperimentLoaderOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.configPath = options.configPath ?? "experiment.json";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async load(): Promise<ExperimentConfig> {
    const url = new URL(this.configPath, this.baseUrl).toString();
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Failed to load ${this.configPath}: ${response.status} ${response.statusText}`);
    }
    return parseExperimentConfig(await response.json());
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const absolute = new URL(baseUrl, "http://example.test/");
  if (!absolute.pathname.endsWith("/")) {
    absolute.pathname = `${absolute.pathname}/`;
  }
  return absolute.toString();
}
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- src/core/experiment-loader.test.ts src/schemas/experiment.schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/core/experiment-loader.ts src/core/experiment-loader.test.ts
git commit -m "feat: add experiment config loader"
```

---

### Task 3: Participant, Session, CSV, And DataPipe Payload

**Files:**
- Create: `src/core/participant-session.ts`
- Create: `src/core/experiment-data.ts`
- Create: `src/core/experiment-data.test.ts`

- [ ] **Step 1: Write failing data tests**

Create `src/core/experiment-data.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createExperimentCsv, createExperimentDataPipePayload, createExperimentFilename } from "./experiment-data";
import { getParticipantId, createSessionId, formatTimestampForId } from "./participant-session";

describe("participant/session ids", () => {
  it("reads participant id from URL params by priority", () => {
    const url = new URL("https://example.test/?subject=SUB2&participant=P1&PROLIFIC_PID=PX");

    expect(getParticipantId({ url, storage: undefined, now: new Date("2026-07-02T12:00:00Z") })).toBe("P1");
  });

  it("generates and stores a fallback participant id", () => {
    const storage = new Map<string, string>();
    const cryptoImpl = { getRandomValues: (array: Uint32Array) => ((array[0] = 123456789), array) } as Crypto;

    const id = getParticipantId({
      url: new URL("https://example.test/"),
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      } as Storage,
      now: new Date("2026-07-02T12:34:56Z"),
      cryptoImpl,
    });

    expect(id).toMatch(/^P_20260702_123456_/);
    expect(storage.get("layoutTaskParticipantId")).toBe(id);
  });

  it("always generates a new session id", () => {
    const cryptoImpl = { getRandomValues: (array: Uint32Array) => ((array[0] = 987654321), array) } as Crypto;

    expect(createSessionId({ now: new Date("2026-07-02T12:34:56Z"), cryptoImpl })).toMatch(/^S_20260702_123456_/);
  });

  it("formats timestamps for ids", () => {
    expect(formatTimestampForId(new Date("2026-07-02T03:04:05Z"))).toBe("20260702_030405");
  });
});

describe("experiment data export", () => {
  const rowInput = {
    participantId: "P001",
    sessionId: "S001",
    experimentId: "layout_task_v1",
    startTime: 1000,
    endTime: 2000,
    tutorialCompleted: true,
    tutorialDurationMs: 1234,
    trialOrder: ["scene_001", "scene_002"],
    trialResults: [
      {
        taskId: "scene_001",
        qid: "Q001",
        encoded: "LAYOUTTASK1|Q001|...",
        result: { schema: "layouttask.result.v1", qid: "Q001", task_id: "scene_001" },
      },
    ],
  };

  it("builds a one-row participant CSV with plain JSON columns", () => {
    const csv = createExperimentCsv(rowInput);

    expect(csv).toContain("participant_id,session_id,experiment_id,start_time,end_time,n_trials");
    expect(csv).toContain("P001,S001,layout_task_v1,1000,2000,1");
    expect(csv).toContain('""scene_001""');
    expect(csv).toContain('""encoded"":""LAYOUTTASK1|Q001|...""');
  });

  it("builds the DataPipe filename and payload", () => {
    const data = createExperimentCsv(rowInput);

    expect(createExperimentFilename("layout-task", "P001", "S001")).toBe("layout-task_P001_S001.csv");
    expect(
      createExperimentDataPipePayload({
        experimentId: "layout_task_v1",
        filenamePrefix: "layout-task",
        participantId: "P001",
        sessionId: "S001",
        data,
      }),
    ).toEqual({
      experimentID: "layout_task_v1",
      filename: "layout-task_P001_S001.csv",
      data,
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- src/core/experiment-data.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Add participant/session helpers**

Create `src/core/participant-session.ts`:

```ts
export interface ParticipantIdOptions {
  url?: URL;
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: Date;
  cryptoImpl?: Pick<Crypto, "getRandomValues">;
}

export interface SessionIdOptions {
  now?: Date;
  cryptoImpl?: Pick<Crypto, "getRandomValues">;
}

const participantParamPriority = ["participant", "participant_id", "subject", "subject_id", "PROLIFIC_PID"];
const storageKey = "layoutTaskParticipantId";

export function getParticipantId(options: ParticipantIdOptions = {}): string {
  const url = options.url ?? new URL(globalThis.location.href);
  for (const key of participantParamPriority) {
    const value = url.searchParams.get(key);
    if (value?.trim()) {
      return sanitizeIdPart(value.trim());
    }
  }

  const stored = options.storage?.getItem(storageKey);
  if (stored) {
    return stored;
  }

  const generated = `P_${formatTimestampForId(options.now ?? new Date())}_${randomSuffix(options.cryptoImpl)}`;
  options.storage?.setItem(storageKey, generated);
  return generated;
}

export function createSessionId(options: SessionIdOptions = {}): string {
  return `S_${formatTimestampForId(options.now ?? new Date())}_${randomSuffix(options.cryptoImpl)}`;
}

export function formatTimestampForId(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "_",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function randomSuffix(cryptoImpl: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
  const values = new Uint32Array(1);
  cryptoImpl.getRandomValues(values);
  return values[0].toString(36).toUpperCase().padStart(6, "0").slice(0, 8);
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "UNKNOWN";
}
```

- [ ] **Step 4: Add CSV and DataPipe helpers**

Create `src/core/experiment-data.ts`:

```ts
export interface ExperimentTrialResultItem {
  taskId: string;
  qid?: string;
  encoded?: string;
  result?: unknown;
}

export interface ExperimentCsvInput {
  participantId: string;
  sessionId: string;
  experimentId: string;
  startTime: number;
  endTime: number;
  tutorialCompleted: boolean;
  tutorialDurationMs: number;
  trialOrder: string[];
  trialResults: ExperimentTrialResultItem[];
}

export interface ExperimentDataPipePayloadInput {
  experimentId: string;
  filenamePrefix: string;
  participantId: string;
  sessionId: string;
  data: string;
}

export function createExperimentCsv(input: ExperimentCsvInput): string {
  const header = [
    "participant_id",
    "session_id",
    "experiment_id",
    "start_time",
    "end_time",
    "n_trials",
    "tutorial_completed",
    "tutorial_duration_ms",
    "trial_order_json",
    "trial_results_json",
  ];
  const row = [
    input.participantId,
    input.sessionId,
    input.experimentId,
    String(input.startTime),
    String(input.endTime),
    String(input.trialResults.length),
    String(input.tutorialCompleted),
    String(input.tutorialDurationMs),
    JSON.stringify(input.trialOrder),
    JSON.stringify(input.trialResults),
  ];

  return `${header.join(",")}\n${row.map(formatCsvCell).join(",")}\n`;
}

export function createExperimentFilename(prefix: string, participantId: string, sessionId: string): string {
  return `${sanitizeFilenamePart(prefix)}_${sanitizeFilenamePart(participantId)}_${sanitizeFilenamePart(sessionId)}.csv`;
}

export function createExperimentDataPipePayload(input: ExperimentDataPipePayloadInput): {
  experimentID: string;
  filename: string;
  data: string;
} {
  return {
    experimentID: input.experimentId,
    filename: createExperimentFilename(input.filenamePrefix, input.participantId, input.sessionId),
    data: input.data,
  };
}

function formatCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "layout-task";
}
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- src/core/experiment-data.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/core/participant-session.ts src/core/experiment-data.ts src/core/experiment-data.test.ts
git commit -m "feat: add experiment data export helpers"
```

---

### Task 4: Confidence State Model

**Files:**
- Create: `src/core/confidence-controller.ts`
- Create: `src/core/confidence-controller.test.ts`

- [ ] **Step 1: Write failing confidence tests**

Create `src/core/confidence-controller.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ConfidenceController } from "./confidence-controller";
import { createRuntimeConfig } from "../test-support/runtime-config";

function configWithGroups() {
  const config = createRuntimeConfig();
  config.objects = [
    { ...config.objects[0], id: "chair_seat", role: "variable", group_id: "chair_group" },
    { ...config.objects[0], id: "chair_back", role: "fixed", group_id: "chair_group" },
    { ...config.objects[0], id: "table_top", role: "variable", group_id: "table_group" },
    { ...config.objects[0], id: "rug", role: "fixed", group_id: "rug_group" },
  ];
  return config;
}

describe("ConfidenceController", () => {
  it("requires confidence only for groups containing variable objects", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    expect(controller.getRequiredGroupIds()).toEqual(["chair_group", "table_group"]);
    expect(controller.canSubmit()).toEqual({
      ok: false,
      reason: "missing_confidence",
      groupId: "chair_group",
    });
  });

  it("clears active confidence when entering a group edit", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose(4);
    expect(controller.canLeaveActiveGroup()).toEqual({ ok: true });
    controller.enterObjectEdit("chair_seat");

    expect(controller.canLeaveActiveGroup()).toEqual({
      ok: false,
      reason: "confidence_required",
      groupId: "chair_group",
    });
  });

  it("blocks switching groups until active confidence is chosen", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");

    expect(controller.canEnterObjectEdit("table_top")).toEqual({
      ok: false,
      reason: "confidence_required",
      groupId: "chair_group",
    });

    controller.choose(5);

    expect(controller.canEnterObjectEdit("table_top")).toEqual({ ok: true });
  });

  it("stores final confidence by group id", () => {
    const controller = new ConfidenceController({
      config: configWithGroups(),
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("chair_seat");
    controller.choose(3);
    controller.leaveActiveGroup();
    controller.enterObjectEdit("table_top");
    controller.choose(2);

    expect(controller.getFinalConfidence()).toEqual({
      chair_group: 3,
      table_group: 2,
    });
    expect(controller.canSubmit()).toEqual({ ok: true });
  });

  it("falls back to object id when group_id is absent", () => {
    const config = createRuntimeConfig();
    config.objects = [{ ...config.objects[0], id: "solo", role: "variable", group_id: undefined }];
    const controller = new ConfidenceController({
      config,
      required: true,
      scale: [1, 2, 3, 4, 5],
    });

    controller.enterObjectEdit("solo");
    controller.choose(1);

    expect(controller.getFinalConfidence()).toEqual({ solo: 1 });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- src/core/confidence-controller.test.ts
```

Expected: FAIL because `ConfidenceController` does not exist.

- [ ] **Step 3: Add controller**

Create `src/core/confidence-controller.ts`:

```ts
import type { RuntimeTaskConfig, RuntimeTaskObject } from "../types/runtime";

export type ConfidenceGateResult =
  | { ok: true }
  | { ok: false; reason: "confidence_required" | "missing_confidence"; groupId: string };

export interface ConfidenceControllerOptions {
  config: RuntimeTaskConfig;
  required: boolean;
  scale: number[];
}

export class ConfidenceController {
  private activeGroupId: string | undefined;
  private activeValue: number | undefined;
  private readonly finalValues = new Map<string, number>();
  private readonly objectToGroup = new Map<string, string>();
  private readonly requiredGroupIds: string[];

  constructor(private readonly options: ConfidenceControllerOptions) {
    const required = new Set<string>();
    for (const object of options.config.objects) {
      const groupId = getConfidenceGroupId(object);
      this.objectToGroup.set(object.id, groupId);
      if (object.role === "variable") {
        required.add(groupId);
      }
    }
    this.requiredGroupIds = Array.from(required);
  }

  getRequiredGroupIds(): string[] {
    return [...this.requiredGroupIds];
  }

  canEnterObjectEdit(objectId: string): ConfidenceGateResult {
    if (!this.options.required) {
      return { ok: true };
    }
    const nextGroupId = this.objectToGroup.get(objectId);
    if (!nextGroupId || nextGroupId === this.activeGroupId) {
      return { ok: true };
    }
    return this.canLeaveActiveGroup();
  }

  enterObjectEdit(objectId: string): void {
    const groupId = this.objectToGroup.get(objectId);
    if (!groupId || !this.requiredGroupIds.includes(groupId)) {
      this.activeGroupId = undefined;
      this.activeValue = undefined;
      return;
    }
    this.activeGroupId = groupId;
    this.activeValue = undefined;
  }

  choose(value: number): void {
    if (!this.activeGroupId || !this.options.scale.includes(value)) {
      return;
    }
    this.activeValue = value;
    this.finalValues.set(this.activeGroupId, value);
  }

  canLeaveActiveGroup(): ConfidenceGateResult {
    if (!this.options.required || !this.activeGroupId) {
      return { ok: true };
    }
    if (this.activeValue !== undefined) {
      return { ok: true };
    }
    return { ok: false, reason: "confidence_required", groupId: this.activeGroupId };
  }

  leaveActiveGroup(): ConfidenceGateResult {
    const gate = this.canLeaveActiveGroup();
    if (!gate.ok) {
      return gate;
    }
    this.activeGroupId = undefined;
    this.activeValue = undefined;
    return { ok: true };
  }

  canSubmit(): ConfidenceGateResult {
    if (!this.options.required) {
      return { ok: true };
    }
    const leaveGate = this.canLeaveActiveGroup();
    if (!leaveGate.ok) {
      return leaveGate;
    }
    for (const groupId of this.requiredGroupIds) {
      if (!this.finalValues.has(groupId)) {
        return { ok: false, reason: "missing_confidence", groupId };
      }
    }
    return { ok: true };
  }

  getActiveGroupId(): string | undefined {
    return this.activeGroupId;
  }

  getFinalConfidence(): Record<string, number> {
    return Object.fromEntries(this.finalValues);
  }
}

function getConfidenceGroupId(object: RuntimeTaskObject): string {
  return object.group_id ?? object.id;
}
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- src/core/confidence-controller.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/core/confidence-controller.ts src/core/confidence-controller.test.ts
git commit -m "feat: add confidence state model"
```

---

### Task 5: Result Confidence Serialization

**Files:**
- Modify: `src/types/result.ts`
- Modify: `src/schemas/result.schema.ts`
- Modify: `src/schemas/result.schema.test.ts`
- Modify: `src/core/recorder.ts`
- Modify: `src/core/layout-task-player.ts`

- [ ] **Step 1: Write failing result schema test**

Add to `src/schemas/result.schema.test.ts`:

```ts
it("accepts confidence values on result payloads", () => {
  const result = createValidResult();
  result.confidence = {
    chair_group: 4,
    table_group: 2,
  };

  expect(resultSchema.parse(result).confidence).toEqual({
    chair_group: 4,
    table_group: 2,
  });
});

it("rejects invalid confidence values", () => {
  const result = createValidResult();
  result.confidence = {
    chair_group: 0,
  };

  expect(() => resultSchema.parse(result)).toThrow();
});
```

If this test file does not expose `createValidResult()`, add a local fixture matching the existing valid result fixture style in the file.

- [ ] **Step 2: Run schema test and confirm failure**

Run:

```bash
npm test -- src/schemas/result.schema.test.ts
```

Expected: FAIL because confidence is not in `resultSchema`.

- [ ] **Step 3: Add confidence type**

In `src/types/result.ts`, add this property to `LayoutTaskResult` after `flow?: ResultFlowInfo;`:

```ts
  confidence?: Record<string, number>;
```

- [ ] **Step 4: Add confidence schema**

In `src/schemas/result.schema.ts`, add:

```ts
export const resultConfidenceSchema = z.record(z.number().int().min(1).max(5));
```

Then add to `resultSchema` after `flow: resultFlowSchema.optional(),`:

```ts
  confidence: resultConfidenceSchema.optional(),
```

- [ ] **Step 5: Wire recorder callback**

In `src/core/recorder.ts`, extend the constructor options with:

```ts
getConfidence?: () => Record<string, number> | undefined;
```

When building the final `LayoutTaskResult`, add:

```ts
const confidence = this.options.getConfidence?.();
if (confidence && Object.keys(confidence).length > 0) {
  result.confidence = confidence;
}
```

- [ ] **Step 6: Pass confidence callback from player**

In `src/core/layout-task-player.ts`, after the confidence controller is introduced in Task 6, pass:

```ts
getConfidence: () => confidence?.getFinalConfidence(),
```

to the `Recorder` constructor.

- [ ] **Step 7: Run targeted tests**

Run:

```bash
npm test -- src/schemas/result.schema.test.ts src/core/layout-task-player.test.ts
```

Expected: PASS after Task 6 wiring is complete. If this task is implemented before Task 6, run only `src/schemas/result.schema.test.ts` and leave player wiring for Task 6.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/types/result.ts src/schemas/result.schema.ts src/schemas/result.schema.test.ts src/core/recorder.ts src/core/layout-task-player.ts
git commit -m "feat: serialize confidence in results"
```

---

### Task 6: Confidence UI And Interaction Gating

**Files:**
- Modify: `src/types/experiment.ts`
- Modify: `src/plugins/jspsych-layout-task.ts`
- Modify: `src/plugins/jspsych-layout-task.test.ts`
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/interaction-controller.ts`
- Modify: `src/core/completion-controller.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/styles/layout-task.css`
- Test: `src/core/confidence-controller.test.ts`
- Test: `src/plugins/jspsych-layout-task.test.ts`

- [ ] **Step 1: Add failing integration-style plugin test**

In `src/plugins/jspsych-layout-task.test.ts`, add:

```ts
it("passes confidence config into the core player", async () => {
  const config = createRuntimeConfig();
  vi.mocked(createLayoutTaskPlayer).mockReturnValue(createPlayerStub());
  const plugin = new LayoutTaskPlugin({ finishTrial: vi.fn() } as unknown as JsPsych);

  await plugin.trial(createDisplayElement(), {
    type: LayoutTaskPlugin,
    config,
    baseUrl: "/layout-task/",
    manifestPath: "manifest.json",
    taskId: null,
    qid: null,
    autoFinishTrial: true,
    writeEncodedToData: true,
    writeResultToData: true,
    writeHeaderToData: true,
    title: "Layout Task",
    confidence: {
      required: true,
      scale: [1, 2, 3, 4, 5],
      labels: {
        "1": "很不确定",
        "2": "不太确定",
        "3": "一般",
        "4": "比较确定",
        "5": "很确定",
      },
    },
  } as any);

  expect(createLayoutTaskPlayer).toHaveBeenCalledWith(
    expect.objectContaining({
      confidence: expect.objectContaining({ required: true }),
    }),
  );
});
```

- [ ] **Step 2: Run plugin test and confirm failure**

Run:

```bash
npm test -- src/plugins/jspsych-layout-task.test.ts
```

Expected: FAIL because plugin params/player options do not include confidence.

- [ ] **Step 3: Extend player and plugin option types**

In `src/plugins/jspsych-layout-task.ts`, add to `LayoutTaskPluginParams`:

```ts
confidence?: {
  required: boolean;
  scale: number[];
  labels: Record<string, string>;
};
tutorialMode?: boolean;
```

Add `confidence` and `tutorialMode` to `info.parameters` as `ParameterType.OBJECT` and `ParameterType.BOOL`.

In `src/core/layout-task-player.ts`, add to `LayoutTaskPlayerOptions`:

```ts
confidence?: {
  required: boolean;
  scale: number[];
  labels: Record<string, string>;
};
tutorialMode?: boolean;
onTutorialEvent?: (event: { type: string; objectId?: string; action?: string }) => void;
```

Pass `confidence: trial.confidence` and `tutorialMode: trial.tutorialMode` when creating the player.

- [ ] **Step 4: Instantiate confidence controller**

In `src/core/layout-task-player.ts`, import `ConfidenceController`, add:

```ts
let confidence: ConfidenceController | undefined;
```

Before creating `Recorder`, add:

```ts
const confidenceOptions = options.confidence;
confidence = confidenceOptions
  ? new ConfidenceController({
      config: options.config,
      required: confidenceOptions.required,
      scale: confidenceOptions.scale,
    })
  : undefined;
```

Pass to `Recorder`:

```ts
getConfidence: () => confidence?.getFinalConfidence(),
```

- [ ] **Step 5: Gate interaction selection and deselection**

In `src/core/interaction-controller.ts`, extend constructor options:

```ts
confidence?: {
  canEnterObjectEdit(objectId: string): { ok: true } | { ok: false; reason: string; groupId: string };
  enterObjectEdit(objectId: string): void;
  canLeaveActiveGroup(): { ok: true } | { ok: false; reason: string; groupId: string };
  leaveActiveGroup(): { ok: true } | { ok: false; reason: string; groupId: string };
};
```

At the start of `selectObject`, before switching/activating:

```ts
const confidenceGate = this.options.confidence?.canEnterObjectEdit(objectId);
if (confidenceGate && !confidenceGate.ok) {
  this.options.renderer.setStatus(`请选择 ${confidenceGate.groupId} 的确定度后再继续。`);
  this.options.renderer.focusConfidence?.();
  return;
}
```

After `this.activeObjectId = objectId;`, add:

```ts
this.options.confidence?.enterObjectEdit(objectId);
this.options.renderer.showConfidenceForActiveGroup?.();
```

At the start of `deselectObject`, before clearing:

```ts
const confidenceGate = this.options.confidence?.leaveActiveGroup();
if (confidenceGate && !confidenceGate.ok) {
  this.options.renderer.setStatus(`请选择 ${confidenceGate.groupId} 的确定度后再退出。`);
  this.options.renderer.focusConfidence?.();
  return;
}
```

- [ ] **Step 6: Gate completion**

In `src/core/completion-controller.ts`, extend constructor options:

```ts
confidence?: {
  canSubmit(): { ok: true } | { ok: false; reason: string; groupId: string };
};
```

At the top of `requestComplete()`, after locked check:

```ts
const confidenceGate = this.options.confidence?.canSubmit();
if (confidenceGate && !confidenceGate.ok) {
  this.options.renderer.setStatus(`请先完成 ${confidenceGate.groupId} 的确定度选择。`);
  this.options.renderer.focusConfidence?.();
  return;
}
```

- [ ] **Step 7: Add renderer confidence UI**

In `src/core/renderer.ts`, add refs:

```ts
confidenceElement?: HTMLElement;
```

Add constructor option:

```ts
confidence?: {
  scale: number[];
  labels: Record<string, string>;
  onChoose(value: number): void;
};
```

Create this method:

```ts
showConfidenceForActiveGroup(): void {
  if (this.refs.confidenceElement) {
    this.refs.confidenceElement.hidden = false;
  }
}

focusConfidence(): void {
  const button = this.refs.confidenceElement?.querySelector<HTMLButtonElement>("button");
  button?.focus();
}
```

Add a `createConfidenceControl()` method:

```ts
private createConfidenceControl(): HTMLElement {
  const wrapper = document.createElement("section");
  wrapper.className = "layout-task-confidence";
  wrapper.hidden = true;

  const title = document.createElement("p");
  title.className = "layout-task-confidence-title";
  title.textContent = "请选择这个家具组的确定度";

  const buttons = document.createElement("div");
  buttons.className = "layout-task-confidence-buttons";

  const confidence = this.options.confidence;
  if (confidence) {
    for (const value of confidence.scale) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "layout-task-confidence-button";
      button.textContent = `${value} ${confidence.labels[String(value)]}`;
      button.addEventListener("click", () => {
        for (const item of buttons.querySelectorAll("button")) {
          item.classList.remove("is-selected");
        }
        button.classList.add("is-selected");
        confidence.onChoose(value);
        this.setStatus(`已选择确定度：${value} ${confidence.labels[String(value)]}`);
      });
      buttons.append(button);
    }
  }

  wrapper.append(title, buttons);
  return wrapper;
}
```

Mount it in the panel before the confirm button:

```ts
const confidenceControl = this.createConfidenceControl();
panel.append(panelTitle, reconstructionHint, instruction, confidenceControl, flowMessage, flowCountdown, confirmButton, status, output, copyAgainButton);
this.refs.confidenceElement = confidenceControl;
```

- [ ] **Step 8: Wire renderer callback from player**

In `src/core/layout-task-player.ts`, when creating `LayoutTaskRenderer`, pass:

```ts
confidence: options.confidence
  ? {
      scale: options.confidence.scale,
      labels: options.confidence.labels,
      onChoose: (value) => confidence?.choose(value),
    }
  : undefined,
```

Pass confidence gate objects into `InteractionController` and `CompletionController`.

- [ ] **Step 9: Add CSS**

In `src/styles/layout-task.css`, add:

```css
.layout-task-confidence {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 12px;
  background: #ffffff;
}

.layout-task-confidence-title {
  margin: 0 0 8px;
  font-weight: 700;
}

.layout-task-confidence-buttons {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.layout-task-confidence-button {
  min-height: 36px;
  border: 1px solid #94a3b8;
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  cursor: pointer;
}

.layout-task-confidence-button.is-selected {
  border-color: #0e7490;
  background: #ecfeff;
  font-weight: 700;
}
```

- [ ] **Step 10: Run tests**

Run:

```bash
npm test -- src/core/confidence-controller.test.ts src/plugins/jspsych-layout-task.test.ts src/schemas/result.schema.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

Run:

```bash
git add src/core/layout-task-player.ts src/core/interaction-controller.ts src/core/completion-controller.ts src/core/renderer.ts src/styles/layout-task.css src/plugins/jspsych-layout-task.ts src/plugins/jspsych-layout-task.test.ts src/types/result.ts src/schemas/result.schema.ts src/schemas/result.schema.test.ts src/core/recorder.ts
git commit -m "feat: require confidence per variable group"
```

---

### Task 7: Tutorial Bubble Controller

**Files:**
- Create: `src/core/tutorial-controller.ts`
- Create: `src/core/tutorial-controller.test.ts`
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/styles/layout-task.css`

- [ ] **Step 1: Write failing tutorial controller tests**

Create `src/core/tutorial-controller.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { TutorialController } from "./tutorial-controller";

describe("TutorialController", () => {
  it("advances when the expected event arrives", () => {
    const onStepChange = vi.fn();
    const controller = new TutorialController({
      steps: [
        { id: "intro", text: "intro", anchor: "display-image", waitFor: { type: "preview_started" } },
        { id: "select", text: "select", anchor: "stage", waitFor: { type: "object_selected" } },
      ],
      onStepChange,
      onComplete: vi.fn(),
    });

    controller.start();
    expect(onStepChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "intro" }), 0);
    controller.handleEvent({ type: "preview_started" });
    expect(onStepChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "select" }), 1);
  });

  it("completes after the final expected event", () => {
    const onComplete = vi.fn();
    const controller = new TutorialController({
      steps: [{ id: "submit", text: "submit", anchor: "confirm", waitFor: { type: "submitted" } }],
      onStepChange: vi.fn(),
      onComplete,
    });

    controller.start();
    controller.handleEvent({ type: "submitted" });

    expect(onComplete).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- src/core/tutorial-controller.test.ts
```

Expected: FAIL because `TutorialController` does not exist.

- [ ] **Step 3: Add tutorial controller**

Create `src/core/tutorial-controller.ts`:

```ts
export interface TutorialEvent {
  type: string;
  objectId?: string;
  action?: string;
}

export interface TutorialStep {
  id: string;
  text: string;
  anchor: string;
  waitFor: TutorialEvent;
}

export interface TutorialControllerOptions {
  steps: TutorialStep[];
  onStepChange(step: TutorialStep, index: number): void;
  onComplete(): void;
}

export class TutorialController {
  private index = -1;

  constructor(private readonly options: TutorialControllerOptions) {}

  start(): void {
    this.index = 0;
    this.emitStep();
  }

  handleEvent(event: TutorialEvent): void {
    const step = this.options.steps[this.index];
    if (!step || !matches(step.waitFor, event)) {
      return;
    }
    this.index += 1;
    if (this.index >= this.options.steps.length) {
      this.options.onComplete();
      return;
    }
    this.emitStep();
  }

  private emitStep(): void {
    const step = this.options.steps[this.index];
    if (step) {
      this.options.onStepChange(step, this.index);
    }
  }
}

function matches(expected: TutorialEvent, actual: TutorialEvent): boolean {
  return (
    expected.type === actual.type &&
    (expected.objectId === undefined || expected.objectId === actual.objectId) &&
    (expected.action === undefined || expected.action === actual.action)
  );
}
```

- [ ] **Step 4: Add renderer tutorial bubble methods**

In `src/core/renderer.ts`, add refs:

```ts
tutorialBubbleElement?: HTMLElement;
```

Add methods:

```ts
showTutorialStep(step: { text: string; anchor: string }): void {
  let bubble = this.refs.tutorialBubbleElement;
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.className = "layout-task-tutorial-bubble";
    this.refs.root.append(bubble);
    this.refs.tutorialBubbleElement = bubble;
  }
  bubble.hidden = false;
  bubble.textContent = step.text;
  bubble.dataset.anchor = step.anchor;
}

hideTutorial(): void {
  if (this.refs.tutorialBubbleElement) {
    this.refs.tutorialBubbleElement.hidden = true;
  }
}
```

Add stable anchor attributes while rendering:

```ts
displayImageFrame.dataset.layoutTaskAnchor = "display-image";
stageWrap.dataset.layoutTaskAnchor = "stage";
confirmButton.dataset.layoutTaskAnchor = "confirm";
```

- [ ] **Step 5: Wire tutorial events from player**

In `src/core/layout-task-player.ts`, when `options.tutorialMode` is true, create a `TutorialController` with these v1 steps:

```ts
const tutorialSteps = [
  { id: "intro", text: "先观察上方刺激图。图片消失后，请复原场景。", anchor: "display-image", waitFor: { type: "reconstruction_started" } },
  { id: "select_first", text: "点击一个家具组进入编辑。", anchor: "stage", waitFor: { type: "object_selected" } },
  { id: "move", text: "使用箭头移动家具。", anchor: "stage", waitFor: { type: "action", action: "move_right" } },
  { id: "rotate", text: "点击旋转按钮调整方向。", anchor: "stage", waitFor: { type: "action", action: "rotate_cw" } },
  { id: "confidence", text: "每次编辑后都必须选择确定度。即使不移动，也要选择。", anchor: "confidence", waitFor: { type: "confidence_chosen" } },
  { id: "deselect", text: "点击空白区域退出当前家具组。", anchor: "stage", waitFor: { type: "object_deselected" } },
  { id: "select_next", text: "选择另一个家具组继续练习。", anchor: "stage", waitFor: { type: "object_selected" } },
  { id: "submit", text: "全部完成后，点击提交。", anchor: "confirm", waitFor: { type: "submitted" } },
];
```

Emit events from existing callbacks:

```ts
onObjectSelect: (objectId) => {
  interaction?.selectObject(objectId);
  tutorial?.handleEvent({ type: "object_selected", objectId });
},
onAction: (objectId, action, event) => {
  const result = interaction?.requestAction({ objectId, action, pointer: ... });
  if (result?.ok) tutorial?.handleEvent({ type: "action", objectId, action });
},
onStageBackgroundClick: () => {
  const before = interaction?.getActiveObjectId();
  interaction?.deselectObject();
  if (before && !interaction?.getActiveObjectId()) tutorial?.handleEvent({ type: "object_deselected", objectId: before });
},
onConfirm: () => {
  void completion?.requestComplete();
  tutorial?.handleEvent({ type: "submitted" });
},
```

When confidence is chosen in renderer callback:

```ts
confidence?.choose(value);
tutorial?.handleEvent({ type: "confidence_chosen" });
```

In `FlowController` reconstruction callback:

```ts
tutorial?.handleEvent({ type: "reconstruction_started" });
```

- [ ] **Step 6: Add CSS**

In `src/styles/layout-task.css`, add:

```css
.layout-task-tutorial-bubble {
  position: fixed;
  z-index: 50;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(520px, calc(100vw - 32px));
  border: 1px solid #0e7490;
  border-radius: 8px;
  padding: 12px 14px;
  background: #ecfeff;
  color: #164e63;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
  font-weight: 700;
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test -- src/core/tutorial-controller.test.ts src/plugins/jspsych-layout-task.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/core/tutorial-controller.ts src/core/tutorial-controller.test.ts src/core/layout-task-player.ts src/core/renderer.ts src/styles/layout-task.css
git commit -m "feat: add guided tutorial overlay"
```

---

### Task 8: Experiment Runner Timeline And End Save

**Files:**
- Create: `src/experiment-runner.ts`
- Create: `src/experiment-runner.test.ts`
- Modify: `src/experiment.ts`

- [ ] **Step 1: Write failing runner tests**

Create `src/experiment-runner.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import { buildExperimentTimeline, collectFormalTrialResults, saveExperimentCsv } from "./experiment-runner";
import type { ExperimentConfig } from "./types/experiment";

function experimentConfig(): ExperimentConfig {
  return {
    schema: "layouttask.experiment.v1",
    experimentId: "layout_task_v1",
    baseUrl: "/layout-task-generated/",
    order: "fixed",
    tutorial: { enabled: true, taskId: "tutorial_room", qid: "QTUTORIAL" },
    confidence: {
      required: true,
      scale: [1, 2, 3, 4, 5],
      labels: { "1": "很不确定", "2": "不太确定", "3": "一般", "4": "比较确定", "5": "很确定" },
    },
    dataSave: {
      mode: "datapipe",
      experimentId: "layout_task_v1",
      endpoint: "https://pipe.jspsych.org/api/data/",
      filenamePrefix: "layout-task",
    },
    trials: [
      { taskId: "scene_001", qid: "Q001" },
      { taskId: "scene_002", qid: "Q002" },
    ],
  };
}

describe("buildExperimentTimeline", () => {
  it("creates tutorial then formal LayoutTask trials in fixed order", () => {
    const timeline = buildExperimentTimeline(experimentConfig());

    expect(timeline).toHaveLength(4);
    expect(timeline[0]).toMatchObject({ type: LayoutTaskPlugin, taskId: "tutorial_room", tutorialMode: true });
    expect(timeline[1]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001", qid: "Q001" });
    expect(timeline[2]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_002", qid: "Q002" });
    expect(timeline[3]).toMatchObject({ type: expect.any(Function) });
  });
});

describe("collectFormalTrialResults", () => {
  it("keeps encoded and result fields for formal trials only", () => {
    const results = collectFormalTrialResults([
      { tutorial: true, task_id: "tutorial_room" },
      { task_id: "scene_001", qid: "Q001", encoded: "ENC1", result: { task_id: "scene_001" } },
    ]);

    expect(results).toEqual([
      {
        taskId: "scene_001",
        qid: "Q001",
        encoded: "ENC1",
        result: { task_id: "scene_001" },
      },
    ]);
  });
});

describe("saveExperimentCsv", () => {
  it("posts one participant-level CSV to DataPipe", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, statusText: "OK" })) as unknown as typeof fetch;

    const result = await saveExperimentCsv({
      dataSave: experimentConfig().dataSave,
      participantId: "P001",
      sessionId: "S001",
      csv: "a,b\n1,2\n",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("https://pipe.jspsych.org/api/data/", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String((fetchImpl as any).mock.calls[0][1].body))).toEqual({
      experimentID: "layout_task_v1",
      filename: "layout-task_P001_S001.csv",
      data: "a,b\n1,2\n",
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- src/experiment-runner.test.ts
```

Expected: FAIL because `experiment-runner.ts` does not exist.

- [ ] **Step 3: Add runner helpers**

Create `src/experiment-runner.ts`:

```ts
import { initJsPsych } from "jspsych";
import InstructionsPlugin from "@jspsych/plugin-instructions";
import LayoutTaskPlugin from "./plugins/jspsych-layout-task";
import { createExperimentCsv, createExperimentDataPipePayload, type ExperimentTrialResultItem } from "./core/experiment-data";
import { createSessionId, getParticipantId } from "./core/participant-session";
import type { ExperimentConfig, ExperimentDataSaveConfig } from "./types/experiment";

export function buildExperimentTimeline(config: ExperimentConfig): any[] {
  const timeline: any[] = [];

  if (config.tutorial.enabled) {
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
  }

  for (const trial of config.trials) {
    timeline.push({
      type: LayoutTaskPlugin,
      baseUrl: config.baseUrl,
      taskId: trial.taskId,
      qid: trial.qid,
      confidence: config.confidence,
      autoFinishTrial: true,
      writeEncodedToData: true,
      writeResultToData: true,
      writeHeaderToData: true,
      data: { formal: true, taskId: trial.taskId, qid: trial.qid },
    });
  }

  timeline.push({
    type: InstructionsPlugin,
    pages: ["实验完成。数据正在保存。"],
    show_clickable_nav: true,
    button_label_next: "完成",
  });

  return timeline;
}

export function collectFormalTrialResults(rows: Array<Record<string, unknown>>): ExperimentTrialResultItem[] {
  return rows
    .filter((row) => !row.tutorial && (row.encoded || row.result))
    .map((row) => ({
      taskId: String(row.task_id ?? row.taskId ?? ""),
      qid: row.qid ? String(row.qid) : undefined,
      encoded: row.encoded ? String(row.encoded) : undefined,
      result: row.result,
    }));
}

export async function saveExperimentCsv(input: {
  dataSave: ExperimentDataSaveConfig;
  participantId: string;
  sessionId: string;
  csv: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.dataSave.mode === "copy") {
    return { ok: true };
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const payload = createExperimentDataPipePayload({
    experimentId: input.dataSave.experimentId,
    filenamePrefix: input.dataSave.filenamePrefix,
    participantId: input.participantId,
    sessionId: input.sessionId,
    data: input.csv,
  });

  try {
    const response = await fetchImpl(input.dataSave.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok ? { ok: true } : { ok: false, error: `${response.status} ${response.statusText}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function createRunnableExperiment(config: ExperimentConfig) {
  const participantId = getParticipantId({ storage: globalThis.localStorage });
  const sessionId = createSessionId();
  const startTime = Date.now();
  const jsPsych = initJsPsych({
    on_finish: async () => {
      const endTime = Date.now();
      const rows = jsPsych.data.get().values() as Array<Record<string, unknown>>;
      const trialResults = collectFormalTrialResults(rows);
      const tutorialRow = rows.find((row) => row.tutorial);
      const csv = createExperimentCsv({
        participantId,
        sessionId,
        experimentId: config.experimentId,
        startTime,
        endTime,
        tutorialCompleted: Boolean(tutorialRow),
        tutorialDurationMs: Number(tutorialRow?.rt ?? 0),
        trialOrder: config.trials.map((trial) => trial.taskId),
        trialResults,
      });
      const saveResult = await saveExperimentCsv({
        dataSave: config.dataSave,
        participantId,
        sessionId,
        csv,
      });
      renderEndPage(csv, saveResult);
    },
  });

  return { jsPsych, timeline: buildExperimentTimeline(config) };
}

function renderEndPage(csv: string, saveResult: { ok: boolean; error?: string }): void {
  document.body.innerHTML = "";
  const section = document.createElement("section");
  section.className = "layout-task-shell";
  const title = document.createElement("h1");
  title.textContent = saveResult.ok ? "实验完成，数据已保存" : "实验完成，但自动保存失败";
  const detail = document.createElement("p");
  detail.textContent = saveResult.ok ? "感谢参与。" : `请复制或下载数据。错误：${saveResult.error ?? "Unknown error"}`;
  const output = document.createElement("textarea");
  output.className = "layout-task-output";
  output.value = csv;
  output.readOnly = true;
  section.append(title, detail, output);
  document.body.append(section);
}
```

- [ ] **Step 4: Verify no new jsPsych dependency is needed**

Run:

```bash
npm ls @jspsych/plugin-instructions
```

Expected: package is already installed. The end page uses the existing instructions plugin, so no new dependency is added.

- [ ] **Step 5: Replace minimal experiment entry**

Modify `src/experiment.ts`:

```ts
import { ExperimentLoader } from "./core/experiment-loader";
import { createRunnableExperiment } from "./experiment-runner";
import "./styles/layout-task.css";

export async function createExperiment() {
  const loader = new ExperimentLoader({ baseUrl: "/experiment/" });
  const config = await loader.load();
  return createRunnableExperiment(config);
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/experiment-runner.test.ts src/core/experiment-data.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/experiment-runner.ts src/experiment-runner.test.ts src/experiment.ts
git commit -m "feat: add jspsych experiment runner"
```

---

### Task 9: Experiment Package Preflight

**Files:**
- Create: `tools/generator/validate-experiment-package.ts`
- Create: `tools/generator/validate-experiment-package.test.ts`
- Modify: `pixi.toml`

- [ ] **Step 1: Write failing preflight tests**

Create `tools/generator/validate-experiment-package.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateExperimentPackage } from "./validate-experiment-package";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function createBase(root: string, taskOverride: Record<string, unknown> = {}) {
  await writeJson(join(root, "experiment.json"), {
    schema: "layouttask.experiment.v1",
    experiment_id: "layout_task_v1",
    baseUrl: "./layout-task/",
    order: "fixed",
    tutorial: { enabled: true, taskId: "tutorial_room", qid: "QTUTORIAL" },
    trials: [{ taskId: "scene_001", qid: "Q001" }],
  });
  await writeJson(join(root, "layout-task", "manifest.json"), {
    schema: "layouttask.manifest.v1",
    experiment_id: "layout_task_v1",
    asset_library: "assets/objects.json",
    background_library: "assets/backgrounds.json",
    behavior_library: "behaviors/behaviors.json",
    tasks: [
      { task_id: "tutorial_room", qid: "QTUTORIAL", file: "tasks/tutorial_room.json" },
      { task_id: "scene_001", qid: "Q001", file: "tasks/scene_001.json" },
    ],
  });
  await writeJson(join(root, "layout-task", "tasks", "tutorial_room.json"), {
    schema: "layouttask.task.v1",
    task_id: "tutorial_room",
    qid: "QTUTORIAL",
    flow: { mode: "preview_then_reconstruct" },
    display_image: { enabled: true, src: "assets/display/tutorial.png" },
  });
  await writeJson(join(root, "layout-task", "tasks", "scene_001.json"), {
    schema: "layouttask.task.v1",
    task_id: "scene_001",
    qid: "Q001",
    flow: { mode: "preview_then_reconstruct" },
    display_image: { enabled: true, src: "assets/display/scene_001.png" },
    ...taskOverride,
  });
}

describe("validateExperimentPackage", () => {
  it("passes when tutorial and formal preview trials are present", async ({ task }) => {
    const root = join(process.cwd(), ".tmp", "validate-experiment-package", task.id);
    await createBase(root);

    const report = await validateExperimentPackage({ baseDir: root, skipRuntimePreflight: true });

    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it("fails when a formal trial is not preview_then_reconstruct", async ({ task }) => {
    const root = join(process.cwd(), ".tmp", "validate-experiment-package", task.id);
    await createBase(root, { flow: { mode: "direct_reconstruction" } });

    const report = await validateExperimentPackage({ baseDir: root, skipRuntimePreflight: true });

    expect(report.ok).toBe(false);
    expect(report.failures).toContainEqual({
      type: "formal_trial_flow",
      taskId: "scene_001",
      message: "Formal trial scene_001 must use flow.mode preview_then_reconstruct",
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
npm test -- tools/generator/validate-experiment-package.test.ts
```

Expected: FAIL because preflight module does not exist.

- [ ] **Step 3: Add preflight CLI**

Create `tools/generator/validate-experiment-package.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseExperimentConfig } from "../../src/schemas/experiment.schema";
import type { ExperimentConfig } from "../../src/types/experiment";
import { validateRuntimePackage } from "./validate-runtime-package";

export interface ExperimentPackageFailure {
  type: "load_error" | "missing_task" | "formal_trial_flow" | "formal_trial_display_image";
  taskId?: string;
  message: string;
}

export interface ExperimentPackageReport {
  ok: boolean;
  failures: ExperimentPackageFailure[];
}

export interface ValidateExperimentPackageOptions {
  baseDir: string;
  configPath?: string;
  skipRuntimePreflight?: boolean;
}

export async function validateExperimentPackage(options: ValidateExperimentPackageOptions): Promise<ExperimentPackageReport> {
  const baseDir = path.resolve(options.baseDir);
  const failures: ExperimentPackageFailure[] = [];
  let config: ExperimentConfig;

  try {
    const raw = await readFile(path.join(baseDir, options.configPath ?? "experiment.json"), "utf8");
    config = parseExperimentConfig(JSON.parse(raw));
  } catch (error) {
    return { ok: false, failures: [{ type: "load_error", message: errorMessage(error) }] };
  }

  const taskBaseDir = path.resolve(baseDir, config.baseUrl);
  const manifest = JSON.parse(await readFile(path.join(taskBaseDir, "manifest.json"), "utf8")) as {
    tasks: Array<{ task_id: string; file: string }>;
  };
  const taskEntries = new Map(manifest.tasks.map((task) => [task.task_id, task]));

  if (config.tutorial.enabled && config.tutorial.taskId && !taskEntries.has(config.tutorial.taskId)) {
    failures.push({
      type: "missing_task",
      taskId: config.tutorial.taskId,
      message: `Tutorial task ${config.tutorial.taskId} is missing from manifest`,
    });
  }

  for (const trial of config.trials) {
    const entry = taskEntries.get(trial.taskId);
    if (!entry) {
      failures.push({ type: "missing_task", taskId: trial.taskId, message: `Formal trial ${trial.taskId} is missing from manifest` });
      continue;
    }
    const task = JSON.parse(await readFile(path.join(taskBaseDir, entry.file), "utf8")) as any;
    if (task.flow?.mode !== "preview_then_reconstruct") {
      failures.push({
        type: "formal_trial_flow",
        taskId: trial.taskId,
        message: `Formal trial ${trial.taskId} must use flow.mode preview_then_reconstruct`,
      });
    }
    if (!task.display_image?.enabled || !task.display_image?.src) {
      failures.push({
        type: "formal_trial_display_image",
        taskId: trial.taskId,
        message: `Formal trial ${trial.taskId} must have enabled display_image.src`,
      });
    }
  }

  if (!options.skipRuntimePreflight) {
    const runtimeReport = await validateRuntimePackage({ baseDir: taskBaseDir, checkTargets: true });
    for (const failure of runtimeReport.failures) {
      failures.push({
        type: "load_error",
        taskId: "task_id" in failure ? failure.task_id : undefined,
        message: JSON.stringify(failure),
      });
    }
  }

  return { ok: failures.length === 0, failures };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const baseDir = process.argv[2];
  if (!baseDir) {
    console.error("Usage: tsx tools/generator/validate-experiment-package.ts <experiment-base-dir>");
    process.exitCode = 1;
    return;
  }
  const report = await validateExperimentPackage({ baseDir });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 4: Add pixi task**

In `pixi.toml`, add:

```toml
validate-experiment-package = "npm exec tsx -- tools/generator/validate-experiment-package.ts"
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- tools/generator/validate-experiment-package.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add tools/generator/validate-experiment-package.ts tools/generator/validate-experiment-package.test.ts pixi.toml
git commit -m "feat: add experiment package preflight"
```

---

### Task 10: Demo Experiment Package

**Files:**
- Create or modify: `public/experiment/experiment.json`
- Create or modify: `public/experiment/README.md`
- Use existing generated LayoutTask package under `public/` or copy a tiny valid package into `public/experiment/layout-task/`.

- [ ] **Step 1: Add demo experiment config**

Create `public/experiment/experiment.json`:

```json
{
  "schema": "layouttask.experiment.v1",
  "experiment_id": "layout_task_demo_v1",
  "baseUrl": "./layout-task/",
  "order": "fixed",
  "tutorial": {
    "enabled": true,
    "taskId": "tutorial_room",
    "qid": "QTUTORIAL"
  },
  "confidence": {
    "required": true,
    "scale": [1, 2, 3, 4, 5],
    "labels": {
      "1": "很不确定",
      "2": "不太确定",
      "3": "一般",
      "4": "比较确定",
      "5": "很确定"
    }
  },
  "data_save": {
    "mode": "copy",
    "filename_prefix": "layout-task"
  },
  "trials": [
    { "taskId": "scene_001", "qid": "Q001" },
    { "taskId": "scene_002", "qid": "Q002" }
  ]
}
```

- [ ] **Step 2: Put a tiny valid LayoutTask package under `public/experiment/layout-task/`**

Use the existing generated package that has:

- `manifest.json`
- `tasks/tutorial_room.json`
- `tasks/scene_001.json`
- `tasks/scene_002.json`
- object/background/display-image assets
- icon assets
- `flow.mode: "preview_then_reconstruct"` for formal trials
- enabled `display_image.src` for formal trials

If no tutorial task exists, duplicate the smallest valid preview task as `tutorial_room` and keep it practice-only through `experiment.json`.

- [ ] **Step 3: Add demo README**

Create `public/experiment/README.md`:

```md
# LayoutTask Experiment Demo

This folder is a static experiment package for GitHub Pages smoke testing.

Open:

```text
https://<owner>.github.io/<repo>/experiment/
```

The flow is:

```text
tutorial -> scene_001 -> scene_002 -> final CSV page
```

The demo uses `data_save.mode = "copy"` so browser smoke tests do not upload real pilot data.
Formal deployment can switch `data_save.mode` to `datapipe`.
```

- [ ] **Step 4: Run preflight**

Run:

```bash
pixi run validate-experiment-package public/experiment
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add public/experiment
git commit -m "test: add experiment runner demo package"
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`
- Modify: `protocol/player-ingestion.md`
- Modify: `docs/superpowers/specs/2026-07-01-experiment-flow-notes.md` only if implementation decisions changed during execution.

- [ ] **Step 1: Update README**

Add a section:

```md
## Experiment Runner

The standalone player still runs one LayoutTask task. The experiment runner runs
a complete jsPsych sequence:

```text
tutorial -> formal preview/reconstruction trials -> final CSV/DataPipe save
```

Experiment-level settings live in `experiment.json`:

- fixed trial order
- tutorial task id
- confidence scale and labels
- participant-level DataPipe save settings
- formal trial list

Each formal trial remains a normal LayoutTask task and must use:

```json
{
  "flow": { "mode": "preview_then_reconstruct" },
  "display_image": { "enabled": true, "src": "..." }
}
```

Confidence is recorded by furniture group. A group requires confidence if it
contains at least one `role: "variable"` object. If `group_id` is missing, the
object id is used as the confidence key.

Final participant-level CSV columns:

```csv
participant_id,session_id,experiment_id,start_time,end_time,n_trials,tutorial_completed,tutorial_duration_ms,trial_order_json,trial_results_json
```

Run preflight before deployment:

```bash
pixi run validate-experiment-package public/experiment
```
```

- [ ] **Step 2: Update protocol ingestion docs**

In `protocol/player-ingestion.md`, add:

```md
## Experiment-Level Package

Rhino/generator output still produces LayoutTask runtime packages. The
experiment runner wraps one package with `experiment.json`.

Use this split:

- `manifest.json` and `tasks/*.json`: geometry, assets, flow, display image,
  collision, object roles, object groups
- `experiment.json`: tutorial, formal order, confidence scale, final save

The generator/pipeline should emit one deployable folder that includes both:

```text
experiment.json
layout-task/manifest.json
layout-task/tasks/*.json
layout-task/assets/**
```

Use `pixi run validate-experiment-package <folder>` after compile and before
GitHub Pages deployment.
```

- [ ] **Step 3: Run docs-adjacent validation**

Run:

```bash
npm test -- src/schemas/experiment.schema.test.ts tools/generator/validate-experiment-package.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add README.md protocol/player-ingestion.md docs/superpowers/plans/2026-07-02-experiment-runner-confidence.md
git commit -m "docs: document experiment runner flow"
```

---

### Task 12: Full Verification And Browser Smoke

**Files:**
- No new source files.
- May update docs if smoke test reveals a deployment instruction gap.

- [ ] **Step 1: Run full unit test suite**

Run:

```bash
pixi run test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run build**

Run:

```bash
pixi run build
```

Expected: `tsc && vite build` exits 0.

- [ ] **Step 3: Run package preflight**

Run:

```bash
pixi run validate-experiment-package public/experiment
```

Expected: JSON report with `"ok": true`.

- [ ] **Step 4: Serve locally**

Run:

```bash
pixi run serve-local
```

Expected: Vite preview starts at:

```text
http://127.0.0.1:5173/
```

- [ ] **Step 5: Browser smoke using the browser/Chrome operation skill**

Open:

```text
http://127.0.0.1:5173/experiment/
```

Manual smoke checklist:

- Tutorial starts before formal trials.
- Preview stimulus appears before reconstruction.
- Reconstruction area is hidden or locked during preview according to task flow config.
- After preview ends, reconstruction area appears.
- Tutorial bubble points to the relevant area and advances only after correct operations.
- Selecting a variable furniture group shows confidence controls.
- Clicking outside before choosing confidence is blocked.
- Selecting another group before choosing confidence is blocked.
- Choosing confidence allows leaving the group.
- Returning to the same group clears active confidence and requires a fresh choice.
- Submit is blocked until every variable group has a final confidence value.
- End page shows one participant-level CSV.
- CSV `trial_results_json` contains both `encoded` and `result`.
- Each formal trial result contains top-level `confidence`.

- [ ] **Step 6: GitHub Pages smoke**

After deployment, open:

```text
https://eastnoob.github.io/LayoutTask_Player/experiment/
```

Repeat the smoke checklist from Step 5. If assets are missing, check:

- `experiment.json` `baseUrl`
- task `display_image.src`
- copied `assets/icons/**`
- copied object/background/display-image assets
- browser console 404s

- [ ] **Step 7: Commit final fixes**

If smoke testing required small fixes:

```bash
git add <changed-files>
git commit -m "fix: polish experiment runner smoke path"
```

---

## Self-Review

Spec coverage:

- Tutorial exists as a real LayoutTask trial plus top-layer guided bubble.
- Tutorial includes preview/reconstruction, select, move, rotate, confidence, deselect, second selection, and submit.
- Formal trials remain one LayoutTask trial containing preview stimulus and reconstruction submit.
- Confidence is required per variable furniture group and saved by `group_id` fallback object id.
- Re-entering edit clears active confidence and requires explicit re-selection.
- Submit is blocked until all variable groups have final confidence.
- Runner uses fixed order only.
- Participant id priority and generated session id are covered.
- Final save is one participant-level CSV row with uncompressed JSON.
- DataPipe request shape matches the existing `{ experimentID, filename, data }` convention.
- Experiment preflight checks runner config, tutorial, formal task presence, preview flow, display image, and runtime package validity.
- Browser smoke explicitly targets local and GitHub Pages URLs.

Placeholder scan:

- No placeholder markers or "copy the previous task" shortcuts are used.
- Task 8 reuses the already installed `@jspsych/plugin-instructions`; no new jsPsych dependency is planned.

Type consistency:

- `ExperimentConfig` uses camelCase in runtime TypeScript and snake_case only in JSON schema parsing.
- Confidence result shape is `Record<string, number>` and serializes as `confidence`.
- `group_id` remains authored task metadata; result key is `group_id ?? object.id`.
- Runner data keeps both `encoded` and `result` per formal trial item.
