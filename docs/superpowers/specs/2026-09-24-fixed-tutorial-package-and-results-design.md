# Fixed Tutorial Package and Tutorial Results Design

**Date:** 2026-09-24  
**Status:** Design approved in conversation; implementation pending written-spec review  
**Scope:** Freeze the tutorial package independently from formal experiment compilation and include tutorial performance in exported trial data.

## Goal

Make one verified tutorial package the permanent tutorial for every future formal compilation, while recording tutorial performance and delivering it together with formal results without counting it as a formal trial.

## Context

The formal experiment package is currently generated under `public/layout-task-run12-core23-preview/`. The tutorial is a separate user-facing flow, but its interactive task and its reference-board assets have not always shared one self-contained base directory. The runner already distinguishes tutorial rows from formal rows in `collectFormalTrialResults`, and the plugin can write either compact encoded output or the rich result object into jsPsych data.

The tutorial package must therefore become a versioned static release artifact, not a compiler output. The compiler may generate formal run packages, but it must never regenerate, clean, or overwrite the tutorial package.

## Requirements

### 1. Fixed, self-contained tutorial package

`public/layout-task-tutorial/` is the sole source of truth for the tutorial. It must contain:

- the fixed tutorial manifest and selected task JSON;
- all referenced object SVGs;
- all referenced collision assets;
- all referenced backgrounds and display images;
- all referenced behavior and scoring data;
- all tutorial reference-board SVG and GIF assets.

The tutorial task must remain outside the formal run manifest. Future formal compilation must not select a new tutorial task or rewrite the fixed tutorial task's coordinates, rotations, assets, copy, or interaction behavior.

Both of these flows must resolve against the tutorial package base URL:

- the interactive tutorial task;
- the tutorial reference board.

Formal trials and formal-only assets must continue to resolve against the formal package base URL.

### 2. Package integrity and version identity

Add a lock/integrity file under `public/layout-task-tutorial/` containing:

- a schema/version identifier;
- the fixed tutorial task ID and QID;
- the source-generation identity used when the package was selected;
- a deterministic list of package files and their SHA-256 digests.

Tests must fail when a required file is missing, the selected task enters the formal manifest, or a locked file changes without the lock data being updated intentionally.

The integrity check is a build/test guard, not a runtime network dependency. Static deployment must work with the package directory alone.

### 3. Tutorial performance in exported data

The tutorial trial must write its rich result object and encoded result into jsPsych data. Tutorial data must be collected separately from formal trial data first, then exported with an explicit trial classification.

Every trial-bearing CSV row must include a `trial_type` column:

- `tutorial` for tutorial result/event rows;
- `formal` for formal experiment rows.

The tutorial row must preserve at least:

- tutorial task ID and QID;
- encoded result and hash when available;
- final furniture state;
- confidence values;
- action/event records, including blocked collision attempts;
- start/end timestamps and duration;
- display/viewport information;
- completion state and tutorial package version.

The existing CSV families retain their purposes:

- `results.csv`: object-level final states for both tutorial and formal trials;
- `raw_results.csv`: one JSON result payload per tutorial or formal trial;
- `events.csv`: action/event rows for tutorial and formal trials;
- `session.csv`: one session summary row, including tutorial completion and duration, while `n_trials` remains the count of formal trials only;
- `debug.json`: session diagnostics, including tutorial presence and package identity.

The independent `tutorial_result.json` remains required as a self-describing backup of the complete tutorial result. It is not a replacement for the CSV rows.

### 4. Unified delivery and failure behavior

The generated tutorial JSON and all CSV/debug files must travel through the same configured save mode:

- `copy`: include them in the copy/download fallback output;
- `datapipe`: upload them as distinct self-describing files;
- `receiver`: include them in the receiver submission's `files` array.

If automatic saving fails, the end page must expose tutorial data in the same recoverable output as formal data. No save path may silently discard tutorial rows merely because formal collection filters tutorial rows.

### 5. Formal experiment isolation

Formal analysis behavior must remain stable:

- formal trial order remains unchanged;
- formal trial count remains 23 for the current run;
- formal scoring consumes only rows with `trial_type=formal`;
- tutorial data must not alter formal task IDs, scoring references, or participant compensation logic;
- the existing compact per-trial backup path remains compatible with the newly classified tutorial result.

## Proposed interfaces

Extend the internal trial result model with an explicit classification rather than inferring it from missing fields:

```ts
type ExperimentTrialType = "tutorial" | "formal";

interface ExperimentTrialResultItem {
  trialType: ExperimentTrialType;
  taskId: string;
  qid?: string;
  encoded?: string;
  hash8?: string;
  result?: LayoutTaskResult | unknown;
}
```

Extend the CSV input with a separately collected tutorial result and package metadata, while retaining the formal-only `trialOrder` and formal count semantics:

```ts
interface ExperimentCsvInput {
  tutorialResult?: ExperimentTrialResultItem;
  tutorialPackageVersion?: string;
  trialResults: ExperimentTrialResultItem[]; // formal rows only for formal count/order
  // existing session fields remain unchanged
}
```

The implementation may choose a different internal shape if the resulting exported behavior satisfies this contract, but the exported `trial_type` values and formal count semantics are fixed.

## Data flow

1. The fixed tutorial package is loaded for the reference board and interactive tutorial.
2. The tutorial plugin writes rich result data and encoded data into jsPsych's local row.
3. The runner extracts tutorial and formal rows using explicit type metadata.
4. CSV builders emit tutorial rows with `trial_type=tutorial` and formal rows with `trial_type=formal`.
5. The runner emits `tutorial_result.json` from the tutorial result plus package identity.
6. The configured save adapter receives all files.
7. If saving fails, the recovery page exposes all files, including tutorial data.

## Non-goals

- Do not regenerate the tutorial from a new random source on each compiler run.
- Do not move formal run assets into the tutorial package merely for convenience.
- Do not insert free-standing section headings into CSV files; `trial_type` is the machine-readable heading/classification.
- Do not count the tutorial as one of the formal 23 trials.
- Do not change furniture coordinates, rotations, collision geometry, or visual behavior as part of this data/package change.

## Verification strategy

### Package tests

- all manifest-referenced task, behavior, background, display, object, collision, SVG, and GIF files exist below `public/layout-task-tutorial/`;
- reference-board asset URLs use the tutorial base URL;
- tutorial task ID is absent from the formal manifest;
- compiler/build checks do not modify the tutorial package;
- lock file detects missing or changed files.

### Data tests

- tutorial plugin rows contain both encoded and rich result fields;
- `collectFormalTrialResults` returns only formal rows;
- tutorial collection returns the tutorial row;
- results/raw/events CSVs include both types and a `trial_type` column;
- session `n_trials` counts formal rows only;
- `tutorial_result.json` contains package identity and rich result data;
- all save modes include the tutorial file and CSV rows;
- save failure recovery output includes tutorial data.

### End-to-end checks

- `npm test` passes;
- `npm run build` passes;
- the static experiment entry loads the fixed tutorial from `layout-task-tutorial/`;
- a formal task still loads from `layout-task-run12-core23-preview/`;
- the final exported files show one `tutorial` classification and 23 `formal` trial classifications without changing formal trial order.

## Grill-me self-review

### Challenge 1: Could reference assets still leak from the formal package?

**Resolution:** Reference-board URLs must resolve through `tutorial.baseUrl`, and all four SVG/GIF pairs must be copied into the tutorial package. Add an assertion against the generated HTML/URL base.

### Challenge 2: Could the compiler erase the fixed tutorial?

**Resolution:** Treat `public/layout-task-tutorial/` as a protected release artifact. Add a package integrity/build test and keep compiler output rooted at the formal package directory.

### Challenge 3: Could adding tutorial rows break CSV parsers?

**Resolution:** Add `trial_type` as a normal CSV column on every trial-bearing row. Do not add free-standing heading lines.

### Challenge 4: Could tutorial data accidentally inflate the formal trial count?

**Resolution:** Keep formal collection and formal `trialOrder` separate; filter/count by `trial_type=formal`, not by total exported rows.

### Challenge 5: Could tutorial data disappear on upload failure?

**Resolution:** Generate `tutorial_result.json` and include it in every save mode and recovery output. Add save adapter tests for copy, DataPipe, and receiver.

### Challenge 6: Could the tutorial be recorded only as a summary?

**Resolution:** The plugin writes rich result data; CSV event/raw rows and the independent JSON preserve detailed tutorial behavior. Session CSV contains only the summary fields intended for session-level analysis.

## Open assumptions

- The existing receiver and DataPipe endpoints accept additional files without requiring a server-side schema migration. If the VPS rejects unknown filenames, the client must use the existing generic file envelope rather than changing the formal CSV contract.
- The tutorial package version is a static identifier derived from the lock file, not a runtime-generated timestamp.

