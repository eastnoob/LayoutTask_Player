# Trial Backup And Plain CSV Transport Design

**Date:** 2026-09-24  
**Status:** Design reviewed by grill-me self-check; ready for implementation planning

## Goal

Preserve a compact, recoverable backup after every completed formal trial while exporting readable, uncompressed CSV files at the end of the experiment.

## Current Findings

The player has two independent save paths:

1. `CompletionController -> DataSaveService` can POST one task result immediately to a task-level DataPipe configuration.
2. `createRunnableExperiment -> saveExperimentFiles` creates session/results/events/debug files at the end of the jsPsych timeline and can POST them through the experiment-level `data_save` configuration.

The current encoder uses `lz-uri` by default. This is compression, not encryption. The current task-level `json-envelope` payload can contain both the compressed `encoded` value and a plain `result`; the current `csv-row` payload still contains the compressed value. The current end-of-experiment `results.csv` also contains an `encoded` column.

The current demo configuration uses `data_save.mode = "copy"`, so it does not currently upload to a remote endpoint. This change defines the behavior for a production DataPipe/VPS configuration without changing the demo's copy-only safety default.

## Agreed Behavior

### 1. Trial-level backup

Each completed formal trial may send a compact JSON envelope to the task-level DataPipe:

```json
{
  "schema": "layouttask.backup.v1",
  "qid": "Q_scene_001",
  "task_id": "scene_001",
  "session": "S001",
  "hash8": "AB12CD34",
  "encoding": "lz-uri",
  "encoded": "LAYOUTTASK1|...|lz-uri|..."
}
```

The backup uses the existing encoder and decoder contract. It contains the compressed result, not a second plain copy of the full result. The envelope makes the record self-identifying and recoverable. The browser's manual Copy action remains unchanged and continues to copy the existing encoded transport string.

### 2. End-of-experiment export

At experiment completion, the existing analysis files remain, with these changes:

- `session.csv`: session-level summary in plain CSV.
- `results.csv`: one row per object, plain analysis fields only; it must no longer include the compressed `encoded` column.
- `events.csv`: one row per recorded action, plain CSV.
- `raw_results.csv`: one row per formal trial, with a `result_json` column containing the complete `LayoutTaskResult` as JSON text, plus identifying fields and `hash8`.
- `debug.json`: existing lightweight debug metadata remains.

The CSV files are text exports. JSON embedded in `raw_results.csv` must use the existing CSV quoting helper so commas, quotes, and line breaks remain valid CSV data.

### 3. Upload semantics

The two saves are intentionally separate:

- trial backup protects completed work if the browser/session ends early;
- final CSV export supports direct analysis and archival.

Trial backup failure must not silently alter the participant's task state or unlock a completed trial. It should use the existing DataPipe status/error path. End-of-experiment upload keeps the existing failure page and recovery messaging.

The copy-only demo configuration remains unchanged unless a production package explicitly selects `datapipe` or `receiver`.

## Compatibility

- Existing `LAYOUTTASK1` encoded strings remain decodable.
- Existing manual copy behavior remains encoded and is not replaced by plain JSON.
- Existing consumers of `session.csv`, `results.csv`, and `events.csv` retain their current columns except for the removal of `results.csv.encoded`; the removed transport artifact is replaced by the new `raw_results.csv` source-of-truth file.
- Existing task-level `json-envelope`, `encoded-only`, and `csv-row` modes remain parseable for old packages. New production configuration should use the backup envelope behavior and should not use `csv-row` as the raw-result transport.

## Non-Goals

- No change to result meaning, object coordinates, confidence values, event recording, or scoring.
- No browser-side cryptographic encryption.
- No automatic retry queue or offline database in this change.
- No change to the VPS endpoint contract beyond accepting the new file/payload names and plain CSV content defined here.

## Grill-Me Self-Check

### Question: Are we saving the same result twice without purpose?

No. The trial payload is a compact recovery backup; the final files are a readable analysis export. They are deliberately different representations and lifetimes.

### Question: Does removing `encoded` from `results.csv` lose the original result?

No. `raw_results.csv.result_json` becomes the plain source-of-truth export, and the trial backup still preserves the existing encoded representation. The plan must test that `result_json` parses back to the exact result object.

### Question: Is the backup encrypted?

No. `lz-uri` is compression/encoding only. The spec must describe it as compressed transport and must not use security language such as encryption or confidentiality.

### Question: Will copy mode unexpectedly start uploading?

No. `mode: "copy"` remains the default and continues to short-circuit remote saving. Tests must cover copy mode as well as DataPipe mode.

### Question: Will CSV quoting break when JSON contains quotes or newlines?

It could if the existing CSV helper is bypassed. The implementation must route `result_json` through the existing `formatCsvCell` path and test nested strings containing quotes, commas, and line breaks.

### Question: Can an incomplete or failed trial appear in the final raw export?

No. `collectFormalTrialResults` already filters tutorial rows and rows without a result/encoded value. The new raw file must use the same formal-trial filtering and must not include tutorial results.

### Question: Are task-level and experiment-level DataPipe configs accidentally conflated?

No. The task-level configuration controls immediate trial backup; the experiment-level configuration controls final file upload. The implementation plan must update their tests independently.

## Acceptance Criteria

1. A production task configured for trial backup posts a JSON envelope containing `encoding`, `hash8`, and compressed `encoded`, without requiring a plain result in that backup payload.
2. `raw_results.csv` is generated for formal trials and every `result_json` cell parses as the original `LayoutTaskResult`.
3. `results.csv` contains no compressed transport column.
4. Existing session/events CSV behavior remains valid.
5. Copy-only mode does not make network requests.
6. Existing encoded strings still round-trip through the decoder.
7. All relevant unit tests and the production build pass.
