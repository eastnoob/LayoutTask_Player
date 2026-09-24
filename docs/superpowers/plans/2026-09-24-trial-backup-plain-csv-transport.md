# Trial Backup And Plain CSV Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a compact recoverable backup after each formal trial and export readable plain CSV files, including a complete per-trial `raw_results.csv`, at experiment end.

**Architecture:** Keep `LayoutTaskEncoder` for manual copy and trial backup. Use the task-level DataPipe JSON envelope as a compressed backup containing metadata plus `encoded`, with no duplicate plain result. Extend the experiment-level CSV exporter with one plain JSON row per formal trial and remove the compressed transport column from the object-level analysis CSV.

**Tech Stack:** TypeScript, Zod, Vitest, jsPsych, LZString, existing DataPipe fetch adapter.

**Spec:** `docs/superpowers/specs/2026-09-24-transport-backup-and-plain-csv-design.md`

## Global Constraints

- `lz-uri` is compression/encoding, never encryption.
- `mode: "copy"` remains network-free.
- Tutorial rows never enter `raw_results.csv`.
- Existing `LAYOUTTASK1` decoding and manual Copy behavior remain unchanged.
- No changes to result semantics, scoring, coordinates, confidence, collision logic, or interaction.
- JSON-in-CSV always uses the existing CSV quoting helper.

## Review Focus

- Backup JSON contains compressed data without an accidental second plain result.
- Nested JSON with quotes, commas, and line breaks round-trips through CSV.
- Formal-trial filtering excludes tutorial and incomplete rows.
- Copy mode never calls `fetch`.
- Existing encoded strings still decode.

---

### Task 1: Define the compact trial-backup envelope

**Files:** Modify `src/core/data-save-service.ts` and `src/core/data-save-service.test.ts`; modify runtime/config types only if the implementation adds a new explicit mode.

**Interface:** `createDataPipeData()` emits a JSON string with schema `layouttask.backup.v1`, fields `qid`, `task_id`, `session`, `hash8`, `encoding`, and `encoded`. It omits `result` when backup-only settings are used.

- [ ] Write a failing DataSaveService test for `json-envelope`, `save_encoded: true`, `save_result: false`; assert the exact envelope fields and absence of `result`.
- [ ] Add a failing copy-mode test proving the provided `fetch` mock is never called.
- [ ] Run `npm test -- --run src/core/data-save-service.test.ts` and record the expected failure.
- [ ] Change only the `json-envelope` branch to emit `layouttask.backup.v1`; preserve `encoded-only` and legacy `csv-row` behavior for existing packages.
- [ ] Run `npm test -- --run src/core/data-save-service.test.ts src/core/encoder.test.ts` and require all tests to pass.
- [ ] Grill checkpoint: verify this is compression, not encryption; copy mode is offline; old encoded strings remain decodable. Fix any failure before Task 2.
- [ ] Commit only this task with `git commit -m "feat: define compact trial backup payload"`.

### Task 2: Add complete plain `raw_results.csv`

**Files:** Modify `src/core/experiment-data.ts` and `src/core/experiment-data.test.ts`.

**Interface:** `createExperimentCsvFiles()` adds a `${prefix}_raw_results_...csv` file with one formal trial per row and columns `participant_id`, `session_id`, `experiment_id`, `trial_index`, `task_id`, `qid`, `hash8`, and `result_json`.

- [ ] Add a fixture with nested result text containing commas, quotes, and a newline; add a tutorial row and an incomplete row.
- [ ] Assert the new file exists, contains only the formal complete trial, and its quoted `result_json` parses to the exact original result object.
- [ ] Run `npm test -- --run src/core/experiment-data.test.ts` and record the expected failure.
- [ ] Implement `createRawResultsCsv()` using the existing formal-trial filtering and `csv()` quoting helper; do not include `trial.encoded`.
- [ ] Run the focused tests and require the JSON round-trip assertion to pass.
- [ ] Grill checkpoint: one trial must produce one raw row; no tutorial row; no decoding required by the researcher. Fix before Task 3.
- [ ] Commit with `git commit -m "feat: export complete plain trial results"`.

### Task 3: Make analysis `results.csv` plain

**Files:** Modify `src/core/experiment-data.ts` and its tests; update `src/experiment-runner.test.ts` only if it asserts file names/counts.

- [ ] Add a failing assertion that `results.csv` has no `encoded` header or compressed payload while retaining `hash8` and all existing final-state/confidence columns.
- [ ] Run the focused test and record the expected failure.
- [ ] Remove only the `encoded` row value and header from `createResultsCsv()`; keep `hash8` as an integrity identifier and keep all state calculations unchanged.
- [ ] Run `npm test -- --run src/core/experiment-data.test.ts src/experiment-runner.test.ts`.
- [ ] Grill checkpoint: `raw_results.csv` is the complete source-of-truth export; `results.csv` is analysis-friendly and requires no decoder. Fix before Task 4.
- [ ] Commit with `git commit -m "refactor: keep transport encoding out of analysis csv"`.

### Task 4: Wire production configuration and documentation

**Files:** Modify `src/core/config-loader.test.ts`, `src/schemas/config.schema.test.ts`, `protocol/player-ingestion.md`, and `public/experiment/README.md`. Do not modify the generated production package or invent a VPS endpoint/token in this plan; the actual endpoint remains deployment-specific.

- [ ] Add a config fixture for task-level DataPipe backup: `mode: datapipe`, `payload_format: json-envelope`, `save_encoded: true`, `save_result: false`; assert the runtime config preserves it.
- [ ] Run `npm test -- --run src/core/config-loader.test.ts src/schemas/config.schema.test.ts` and record the expected failure before wiring.
- [ ] Document the exact production settings to apply when an endpoint is supplied: task-level `data_save.mode = "datapipe"`, `payload_format = "json-envelope"`, `save_encoded = true`, and `save_result = false`; keep the demo `public/experiment/experiment.json` in `mode: copy`.
- [ ] Document that trial backup is compressed JSON envelope, final uploads are `session.csv`, `results.csv`, `raw_results.csv`, `events.csv`, and `debug.json`, and no value is encrypted.
- [ ] Run config and package validation tests.
- [ ] Grill checkpoint: task-level backup and experiment-level final upload remain separate; demo remains network-free; filenames are distinguishable. Fix before Task 5.
- [ ] Commit only relevant config/docs/tests with `git commit -m "docs: define production backup and csv transport configuration"`.

### Task 5: Full verification and handoff

**Files:** Verify `src/core/data-save-service.ts`, `src/core/experiment-data.ts`, `src/core/encoder.ts`, `src/experiment-runner.ts`, and all changed tests/docs.

- [ ] Run `npm test -- --run` and require every test to pass.
- [ ] Run `npm run build` and require TypeScript and Vite to pass.
- [ ] Inspect generated fixture output: backup is compressed JSON, `raw_results.csv` parses, and `results.csv` has no encoded column.
- [ ] Run `git diff --check` and `git status --short`; preserve unrelated user changes.
- [ ] Final grill: prove early-exit recovery, readable final CSV, one complete raw row per formal trial, offline copy mode, and old encoded-string compatibility.
- [ ] Commit only implementation files for this plan with `git commit -m "feat: separate compact trial backup from plain csv export"`.
