# Browser Session Backup and Recovery Design

## Goal

Keep a complete local backup of every completed Layout Task trial and the final experiment files in the participant's browser until the remote save/archival flow succeeds. If remote saving fails, generate the recovery ZIP from that local backup and keep it available for manual submission.

## Scope

- Applies to tutorial and formal trial results produced by the experiment runner.
- Applies to copy, DataPipe, and receiver save modes without changing their existing payload contracts.
- Uses browser IndexedDB for payload data; `localStorage` remains appropriate only for small identifiers and preferences.
- Does not change furniture coordinates, rotations, collision geometry, confidence rules, trial scheduling, or the receiver schema.

## Data Lifecycle

1. When a trial completes, persist its exact submitted file payload locally before attempting remote upload.
2. The receiver/DataPipe upload proceeds using the existing request format.
3. At experiment completion, persist `session.csv`, `results.csv`, `raw_results.csv`, `events.csv`, `debug.json`, and `tutorial_result.json` locally before the final save operation.
4. Recovery ZIP generation reads the complete local session file set, not only the last in-memory upload argument or failed filename.
5. Clear the browser session backup only after the configured remote save reports success. Copy mode is not remote success, so its local backup remains available for manual copy/recovery.
6. On any upload or archive failure, retain the local backup and expose a complete recovery ZIP/text recovery path.

## Local Store Contract

`LocalBackupStore` owns one participant/session namespace and exposes:

- `saveFile(file): Promise<void>`
- `saveFiles(files): Promise<void>`
- `listFiles(): Promise<ExperimentCsvFile[]>`
- `clear(): Promise<void>`

The production implementation uses one IndexedDB database/object store. Writes are keyed by filename within the session, so a retry replaces the same file instead of duplicating it. A small in-memory implementation is used by unit tests.

## Failure Semantics

- A local IndexedDB write failure is a save failure; the remote upload is not attempted for that payload because the required local safety copy was not established.
- A remote timeout or HTTP failure retains IndexedDB data.
- A successful receiver/DataPipe final save clears IndexedDB only after all required files and receiver archive confirmation succeed.
- Recovery output is assembled from all locally stored files. If the local store itself failed before any data was stored, the current in-memory files remain the minimum fallback.
- Clearing is scoped to the current experiment/participant/session namespace.

## Compatibility

- `DataSaveService` remains responsible for one trial's remote upload and receives an optional local store dependency.
- `saveExperimentFiles` remains the final batch entry point and receives the same store.
- Existing callers that omit the store continue to work in tests and standalone integrations.
- No receiver endpoint or token is invented or changed by this feature.

## Acceptance Criteria

- Every completed trial is present in the local store before the trial advances.
- Final generated files are present in the local store before final upload.
- A failed final save produces a ZIP containing all locally stored trial and final files.
- Successful receiver archive removes only the current session's local backup.
- Copy mode remains offline and does not call `fetch`.
- Existing full frontend test suite and build pass.
