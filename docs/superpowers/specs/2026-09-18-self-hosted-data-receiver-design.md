# Self-Hosted Data Receiver Design

## Goal

Add a self-hosted data receiver path for the static Layout Task experiment runner.

The participant-facing experiment must remain deployable as pure static files, including on GitHub Pages. The only network dependency added for automatic collection is an HTTPS receiver endpoint such as `https://data.example.com/submit`, hosted separately on the researcher's VPS.

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
  Caddy or Nginx terminates HTTPS
  Docker receiver service
  filesystem raw files
  submissions.jsonl append log
  SQLite metadata/index database
```

The receiver is not the experiment host. It is only a submit box.

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

Runtime shape:

```ts
interface ExperimentReceiverSaveConfig {
  mode: "receiver";
  experimentId: string;
  endpoint: string;
  filenamePrefix: string;
  submitToken?: string;
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
    },
    {
      "filename": "layout_results_P001_S001.csv",
      "content_type": "text/csv",
      "data": "..."
    },
    {
      "filename": "layout_events_P001_S001.csv",
      "content_type": "text/csv",
      "data": "..."
    }
  ]
}
```

Send the public study token as a header when configured:

```text
X-Submit-Token: public-study-token
```

The token is not a secret because it is visible in the static page. It is a routing and abuse-reduction knob, not real authentication.

## Receiver API

Required routes:

- `GET /health`: returns a small JSON health response.
- `POST /submit`: accepts one full experiment submission with one or more files.

Optional compatibility route:

- `POST /api/data/`: accepts the existing DataPipe-style single-file body `{ experimentID, filename, data }`. This is useful for local transition, but the preferred new frontend path is batch `POST /submit`.

`POST /submit` validation:

- Require `schema === "layouttask.receiver.submission.v1"`.
- Require non-empty `experiment_id`.
- Require non-empty `participant_id`.
- Require non-empty `session_id`.
- Require `files` length from 1 to a configured maximum, default 8.
- Require each filename to be basename-only after sanitization; no slashes, drive letters, or path traversal.
- Require each data string to be below a configured size limit.
- Reject unknown token when `SUBMIT_TOKEN` is configured.
- Allow unknown file kinds, but classify them as `unknown`.

## Storage Design

The receiver must not treat SQL as the only source of truth. Store three layers:

```text
data/
  submissions.jsonl
  files/
    <experiment_id>/
      <participant_id>/
        <session_id>/
          layout_session_P001_S001.csv
          layout_results_P001_S001.csv
          layout_events_P001_S001.csv
          layout_debug_P001_S001.json
  submissions.sqlite
```

Layer 1: append-only JSONL log

- One line per accepted submission.
- Contains the normalized envelope metadata, file names, file hashes, sizes, received timestamp, and request metadata.
- Does not need to duplicate large file contents.

Layer 2: raw files

- Save every submitted file exactly as received after validation.
- Preserve CSV files as `.csv`.
- Preserve debug or extra files as their submitted extension when safe, otherwise `.txt`.
- Unknown file types are saved, indexed, and classified as `unknown`.

Layer 3: SQLite

SQLite stores metadata, hashes, status, and optional parsed rows. It is for lookup, export, diagnostics, and deduplication, not the only canonical copy.

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
  body_sha256 TEXT NOT NULL
);

submission_files(
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  path TEXT NOT NULL,
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

Optional parsed analysis tables:

```sql
session_rows(...)
result_rows(...)
event_rows(...)
```

The first implementation can create the core tables and defer parsed analysis tables if necessary. Because raw CSV files are preserved, parsed tables can be backfilled later.

## CSV And Debug File Policy

Known file kinds:

- `layout_session_*.csv` -> `session`
- `layout_results_*.csv` -> `results`
- `layout_events_*.csv` -> `events`
- `layout_debug_*.json` -> `debug`
- anything else -> `unknown`

CSV files must be stored as raw files. The receiver may also store parsed summaries in SQLite, but it must never replace the raw CSV with only parsed rows.

Debug files should be first-class submissions. They may contain client logs, asset load errors, timing metadata, config hashes, or future diagnostics. Store them as raw files and index them in `submission_files`. Add parsed debug fields only when a concrete analysis need appears.

## Deployment

Use Docker Compose on the VPS:

```text
receiver service
  listens on internal port 3000
  writes to /app/data

caddy service
  exposes 80 and 443
  reverse_proxy receiver:3000
```

The receiver container should not publish its own host port directly. Only Caddy/Nginx should be public.

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
```

## CORS

The receiver should allow browser submissions only from configured origins.

For development, `ALLOWED_ORIGINS` may include local preview hosts. For production, it should include the final GitHub Pages origin or static hosting domain. If multiple experiment pages are used, use a comma-separated allowlist.

## Clearing Test Data

Do not expose a public delete endpoint.

Provide a local operational command inside the receiver:

```bash
docker compose exec receiver npm run clear-data
```

The command should:

- stop accepting writes during the clear operation or require the service to be stopped first,
- remove raw files under `data/files`,
- truncate or recreate `submissions.jsonl`,
- recreate SQLite tables,
- leave Docker and Caddy configuration untouched.

For a full reset, the researcher can also stop the stack and remove `./data`.

## Error Handling

Frontend:

- Show the existing saving page during upload.
- On success, show the existing completion page.
- On failure, show the failure page and include all generated CSV contents in the textarea fallback.

Receiver:

- Return `201` for accepted submissions.
- Return `400` for malformed submissions.
- Return `401` or `403` for token mismatch.
- Return `413` for body or file size limit.
- Return `429` for rate limit.
- Return `500` only for unexpected storage failures.

Responses should be compact JSON:

```json
{
  "ok": false,
  "error": "invalid_filename",
  "message": "Submitted filenames must not contain path separators."
}
```

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
- SQLite and files not public.
- no public deletion route.
- logs sufficient for audit and debugging.

This design intentionally avoids participant login because the study requirement is open static participation.

## Testing

Frontend tests:

- experiment schema parses `receiver` mode.
- experiment runner posts one batch submission with the three generated CSV files.
- DataPipe mode still posts single-file DataPipe payloads.
- copy mode still does not upload.
- failure fallback still renders generated data.

Receiver tests:

- accepts a valid batch submission and writes JSONL, files, and SQLite rows.
- rejects path traversal filenames.
- rejects oversized bodies.
- rejects token mismatch when configured.
- classifies session/results/events/debug/unknown file kinds.
- clear-data removes raw files and resets SQLite/JSONL.

Manual smoke:

- build static frontend.
- serve frontend from local preview or GitHub Pages-like static host.
- run receiver locally through Docker Compose.
- complete one experiment.
- verify one submission, three CSV files, and SQLite metadata.
- clear data and verify the receiver returns to empty state.

## Out Of Scope

- Participant identity verification.
- Researcher dashboard.
- Public data download UI.
- Automatic cloud backup.
- Parsed analysis tables beyond the metadata needed for ingestion verification.
- Replacing the existing decoder/export tools.

## Grill-Me Self-Check

Question: Are we accidentally making GitHub Pages impossible by adding server config to the frontend?

Answer: No. The static frontend only stores an HTTPS endpoint and optional public token in JSON config. It still builds and deploys as static files.

Question: Are we losing the existing DataPipe behavior?

Answer: No. `datapipe` remains a separate save mode. `receiver` is additive.

Question: Is SQL enough for debug and CSV data?

Answer: SQL alone is not enough. The spec requires raw CSV/debug files plus JSONL plus SQLite metadata. Parsed SQL rows are optional and backfillable.

Question: Is the public token pretending to be secure authentication?

Answer: No. The spec explicitly treats it as abuse reduction and routing. The security model relies on limits, validation, CORS, HTTPS, and private storage.

Question: Does the receiver know too much about Layout Task internals?

Answer: Only enough to classify known file prefixes. It accepts unknown files and stores them safely, so future debug payloads do not require immediate receiver changes.

Question: Can test data be cleared safely?

Answer: Yes, through a local operational command only. There is no public deletion route.

Question: What is the riskiest unresolved point?

Answer: Whether parsed `session_rows`, `result_rows`, and `event_rows` should be implemented in the first pass. The spec resolves this by making core ingestion mandatory and parsed analysis tables optional/backfillable.
