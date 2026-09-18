# Self-Hosted Data Receiver Design

## Goal

Add a self-hosted data receiver path for the static Layout Task experiment runner.

The participant-facing experiment must remain deployable as pure static files, including on GitHub Pages. The receiver is a separate HTTPS endpoint on the VPS. The VPS should behave as an ingress and short-term buffer, not as the long-term store for large experiment files.

## Current System

The project already has two relevant save layers:

- Task-level `data_save` in individual LayoutTask runtime config. This supports copy-only and DataPipe-style browser uploads for one completed task.
- Experiment-level `data_save` in `public/experiment/experiment.json`. This is the path used by the jsPsych experiment runner. At the end of the full experiment it generates three CSV files:
  - `layout_session_<participant>_<session>.csv`
  - `layout_results_<participant>_<session>.csv`
  - `layout_events_<participant>_<session>.csv`

The self-hosted receiver work targets the experiment-level save path first. Task-level DataPipe support can remain as a compatibility feature.

## Non-Negotiable Constraints

- The experiment frontend must still build to static assets.
- The experiment frontend must still work from GitHub Pages or another static host.
- Participants must not need login, installation, VPN, or access to the VPS dashboard.
- The VPS must expose only the HTTPS receiver endpoint to participants.
- Database ports, data files, admin tools, and destructive operations must not be exposed publicly.
- Automatic upload failure must still produce a participant-visible fallback with the generated data.
- The VPS must not accumulate large raw result files after successful external archival.

## Recommended Architecture

```text
GitHub Pages / static host
  public experiment page
  jsPsych runner
  generates session/results/events CSV files
       |
       | POST https://data.example.com/submit
       v
VPS
  Caddy terminates HTTPS
  Docker receiver service
  short-term spool for accepted files
  rclone archive worker to external storage
  SQLite metadata/index database
       |
       | archive then remove local raw files
       v
External object storage
  Cloudflare R2 / S3 / WebDAV / other rclone remote
```

The receiver is not the experiment host and is not the canonical raw-data archive. It is a submit box and relay.

## Frontend Design

Add an experiment-level save mode:

```json
{
  "data_save": {
    "mode": "receiver",
    "endpoint": "https://data.example.com/submit",
    "experiment_id": "layout_task_v1",
    "filename_prefix": "layout-task",
    "submit_token": "public-study-token"
  }
}
```

The experiment runner should reuse the existing `createExperimentCsvFiles()` output and submit all generated files in one request:

```json
{
  "schema": "layouttask.receiver.submission.v1",
  "experiment_id": "layout_task_v1",
  "participant_id": "P001",
  "session_id": "S001",
  "files": [
    {
      "filename": "layout_session_P001_S001.csv",
      "content_type": "text/csv",
      "data": "..."
    }
  ]
}
```

Send the public study token as `X-Submit-Token` when configured. The token is visible in the static page, so it is only a routing and abuse-reduction control.

## Receiver API

Required routes:

- `GET /health`: returns a small JSON health response.
- `POST /submit`: accepts one full experiment submission with one or more files.

Optional compatibility route:

- `POST /api/data/`: accepts the existing DataPipe-style single-file body `{ experimentID, filename, data }`.

Validation:

- Require `schema === "layouttask.receiver.submission.v1"`.
- Require non-empty `experiment_id`, `participant_id`, and `session_id`.
- Require `files` length from 1 to a configured maximum, default 8.
- Require each filename to be basename-only after sanitization.
- Require each data string to be below a configured size limit.
- Reject unknown token when `SUBMIT_TOKEN` is configured.
- Allow unknown file kinds, but classify them as `unknown`.

## Storage And Archival Design

The receiver must not treat VPS disk as the long-term raw data store. Store only active operational layers plus an optional pruned metadata-archive cache:

```text
data/
  spool/
    <submission_id>/
      layout_session_P001_S001.csv
      layout_results_P001_S001.csv
      layout_events_P001_S001.csv
      manifest.json
  submissions.jsonl
  submissions.sqlite
  metadata_archives/
    <timestamp>[-<label>]/
      submissions.sqlite
      submissions.jsonl
```

Layer 1: short-term spool

- Raw submitted files are written to `spool/<submission_id>/`.
- A `manifest.json` records metadata, hashes, stable file indexes, file IDs, and intended external archive paths.
- After successful archival, raw files are deleted from local spool by default.
- Failed archival leaves files in spool with `archive_status = "pending"` or `"failed"` so no accepted data is lost.

Layer 2: append-only JSONL metadata log

- One line per accepted submission.
- Contains normalized envelope metadata, file names, hashes, sizes, received timestamp, request metadata, and archive status.
- Does not duplicate large file contents.

Layer 3: SQLite metadata/index database

SQLite stores metadata, hashes, status, stable file indexes, local spool path if still present, external archive URI if archived, and diagnostics. It is for lookup, retry, export, and audit. It is not the canonical raw-data copy.

Optional local layer: pruned metadata archive bundles

- `metadata_archives/` contains old SQLite/JSONL snapshots created before clearing active metadata.
- It is a short-retention cache, not a permanent VPS history store.
- Production can set `METADATA_ARCHIVE_LOCAL_KEEP=0` after external upload.

Each submitted file must have a stable per-submission index and globally unique file ID:

- `file_index` is a 1-based integer assigned during validation in request order.
- `file_id` is derived from the submission ID and index, for example `<submission_id>-f001`.
- Archived object names include both `file_id` and the sanitized original filename, for example `f001__layout_session_P001_S001.csv`.
- Lookup must not depend on local spool files or row order. Operators should be able to locate a file by querying `submission_files.file_id`, `submission_files.file_index`, or `submission_files.archive_uri` even after local raw files are deleted. `submission_files.archive_uri` is the full file URI, not only the archived submission directory.

Core tables:

```sql
submissions(
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  remote_addr TEXT,
  user_agent TEXT,
  file_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  body_sha256 TEXT NOT NULL,
  archive_status TEXT NOT NULL
);

submission_files(
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  file_index INTEGER NOT NULL,
  file_id TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  archive_filename TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  local_path TEXT,
  archive_uri TEXT,
  archive_status TEXT NOT NULL,
  FOREIGN KEY(submission_id) REFERENCES submissions(id)
);

receiver_logs(
  id TEXT PRIMARY KEY,
  submission_id TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(submission_id) REFERENCES submissions(id)
);
```

Known file kinds:

- `layout_session_*.csv` -> `session`
- `layout_results_*.csv` -> `results`
- `layout_events_*.csv` -> `events`
- `layout_debug_*.json` -> `debug`
- anything else -> `unknown`

## External Archive Backend

Use `rclone` as the first production archival backend:

```text
ARCHIVE_MODE=local|rclone|disabled
ARCHIVE_RCLONE_REMOTE=layouttask-receiver:submissions
ARCHIVE_DELETE_LOCAL_AFTER_SUCCESS=true
ARCHIVE_RETRY_ON_START=true
```

`local` mode is for local development and tests. It copies accepted files into a local archive directory and can still delete spool files after the copy.

`rclone` mode is for VPS production. The receiver invokes `rclone copy` or `rclone copyto` from the container to push `spool/<submission_id>/` to the configured remote path:

```text
<remote>/<experiment_id>/<participant_id>/<session_id>/<submission_id>/
```

This keeps Cloudflare R2, S3, WebDAV, and similar stores behind one operational interface. Existing Proton Pass entries can hold rclone credentials; secrets are mounted on the VPS as Docker environment/config files, not committed to the repository.

## Local Retention Policy

Default production policy:

- Delete raw local spool files after successful archive.
- Keep SQLite and JSONL metadata only as the active operational index.
- Keep failed or pending spool directories until retry succeeds.
- Provide a retry command for pending/failed archives.
- Provide a metadata archival command that snapshots the active SQLite/JSONL metadata to a timestamped archive bundle, then clears the active metadata tables/log.
- Prune local metadata archive bundles automatically after `archive_metadata` runs. The VPS should keep only a small configured count, default 3 bundles, or 0 when metadata bundles are uploaded externally.

Deleting data from the external archive removes the canonical raw data. The VPS should not keep another raw copy after successful archive.

The receiver should not try to perform bidirectional synchronization with external object storage. If a researcher deletes or retires a dataset in the external archive, the matching active VPS index should be archived and cleared by an explicit operational command. The old index bundle can be uploaded to external storage, kept briefly on the VPS according to retention settings, or deleted with the retired dataset, but it should not remain in the active receiver tables by default.

## Deployment

Use Docker Compose on the VPS:

```text
receiver service
  listens on internal port 3000
  writes to /app/data
  reads rclone config from /config/rclone

caddy service
  exposes 80 and 443
  reverse_proxy receiver:3000
```

The receiver container should not publish its own host port directly. Only Caddy should be public.

Expected environment variables:

```text
PORT=3000
DATA_DIR=/app/data
ALLOWED_ORIGINS=https://your-github-pages-site.example
SUBMIT_TOKEN=public-study-token
MAX_BODY_BYTES=5242880
MAX_FILES_PER_SUBMISSION=8
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
ARCHIVE_MODE=local
ARCHIVE_LOCAL_DIR=/app/archive
ARCHIVE_RCLONE_REMOTE=
ARCHIVE_DELETE_LOCAL_AFTER_SUCCESS=true
METADATA_ARCHIVE_LOCAL_KEEP=3
METADATA_ARCHIVE_RCLONE_REMOTE=
METADATA_ARCHIVE_DELETE_LOCAL_AFTER_UPLOAD=true
```

## Clearing Test Data

Do not expose a public delete endpoint.

Provide local operational commands:

```bash
docker compose exec receiver python -m app.retry_archive
docker compose exec receiver python -m app.clear_data
docker compose exec receiver python -m app.archive_metadata
```

`archive_metadata` should write a timestamped SQLite/JSONL snapshot before clearing active metadata. If `METADATA_ARCHIVE_RCLONE_REMOTE` is configured, it should upload that snapshot externally and delete the local copy when `METADATA_ARCHIVE_DELETE_LOCAL_AFTER_UPLOAD=true`. It should then prune local metadata archive bundles to `METADATA_ARCHIVE_LOCAL_KEEP`. `clear_data` should clear local spool, JSONL, and SQLite metadata without creating a snapshot. Neither command should delete external object storage unless a separate explicit remote-clean command is added later.

## Error Handling

Frontend:

- Show the existing saving page during upload.
- On success, show the existing completion page.
- On failure, show the failure page and include all generated CSV contents in the textarea fallback.

Receiver:

- Return `201` for accepted submissions only after local spool write and archive attempt are recorded.
- Return compact JSON errors for malformed submissions, token mismatch, size limits, rate limits, and storage failures.
- If external archival fails after local acceptance, return `202` only if the design intentionally accepts queued archival. The first implementation should prefer `201` for fully archived submissions and `500` for archival failure, leaving local spool in place for retry.

## Security Model

This is an anonymous public collection endpoint. It cannot prove participant identity by itself.

Mitigations:

- HTTPS only.
- CORS allowlist.
- public submit token.
- request size limit.
- file count limit.
- filename sanitization.
- per-IP rate limit.
- no public deletion route.
- raw files removed from VPS after successful archive.
- archive credentials stored outside git.

## Testing

Frontend tests:

- experiment schema parses `receiver` mode.
- experiment runner posts one batch submission with the three generated CSV files.
- DataPipe mode still posts single-file DataPipe payloads.
- copy mode still does not upload.
- failure fallback still renders generated data.

Receiver tests:

- accepts a valid batch submission and writes spool, JSONL, and SQLite rows.
- local archive mode copies files and deletes spool when configured.
- rejected filenames and oversized bodies fail.
- token mismatch fails.
- file kinds are classified.
- retry command archives pending submissions.
- clear-data removes local spool and metadata without touching remote storage.

Manual smoke:

- build static frontend.
- run receiver locally in local archive mode.
- complete one experiment or submit a test payload.
- verify archived files exist in local archive and spool is empty.
- after DNS is ready, deploy to VPS with rclone mode and verify `https://data.<domain>/health`.

## Out Of Scope

- Participant identity verification.
- Researcher dashboard.
- Public data download UI.
- Automatic analysis-table parsing beyond ingestion metadata.
- Replacing the existing decoder/export tools.
- Automatically managing Spaceship DNS.
