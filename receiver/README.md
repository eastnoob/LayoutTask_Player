# Layout Task Receiver

This service receives completed Layout Task experiment files from a static frontend.

## Deployment

1. Point `data.example.com` to the VPS.
2. Copy `Caddyfile.example` to `Caddyfile` and replace the domain.
3. Create `.env`:

```text
ALLOWED_ORIGINS=https://your-github-pages-site.example
SUBMIT_TOKEN=public-study-token
ASSIGNMENT_EXPERIMENT_ID=layout-task-run12-core23
ASSIGNMENT_SCHEDULE_VERSION=run12-williams-v1
ASSIGNMENT_SEQUENCE_IDS=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46
ARCHIVE_MODE=local
ARCHIVE_DELETE_LOCAL_AFTER_SUCCESS=true
METADATA_ARCHIVE_LOCAL_KEEP=3
```

For VPS production, configure `rclone/rclone.conf` on the server and set:

```text
ARCHIVE_MODE=rclone
ARCHIVE_RCLONE_REMOTES=jianguoyun=layouttask-webdav:experimentalDataPipeline/layouttask-receiver/submissions;sciebo=layouttask-sciebo:experimentalDataPipeline/layouttask-receiver/submissions
METADATA_ARCHIVE_RCLONE_REMOTES=jianguoyun=layouttask-webdav:experimentalDataPipeline/layouttask-receiver/metadata-indexes;sciebo=layouttask-sciebo:experimentalDataPipeline/layouttask-receiver/metadata-indexes
METADATA_ARCHIVE_DELETE_LOCAL_AFTER_UPLOAD=true
METADATA_ARCHIVE_LOCAL_KEEP=0
```

`ARCHIVE_RCLONE_REMOTES` and `METADATA_ARCHIVE_RCLONE_REMOTES` use
`name=rclone-remote:path;name=rclone-remote:path`. Each target is tracked
independently in `archive_targets`. A successful target is not uploaded again
by `retry_archive`; local spool data is deleted only after every configured
target succeeds. The older singular variables remain supported for one-target
deployments.

4. Start:

```bash
docker compose up -d --build
```

`/assign` reads the configured comma-separated sequence IDs and stores assignments in
`data/submissions.sqlite`. Keep the `./data` volume mounted so assignments survive
receiver restarts. The sequence list must match the published schedule in order.

## Data

Accepted submissions are stored in:

```text
data/submissions.jsonl
data/submissions.sqlite            # includes the archive_targets table
data/spool/<submission_id>/        # pending or failed archive only
data/metadata_archives/<timestamp>/ # recent local archived indexes, pruned automatically
archive/<experiment>/...           # local development archive only
```

For the approved R12 deployment, replace the example sequence list with the
complete ordered sequence IDs from the published schedule. Do not let the
static frontend generate participant numbers; `/assign` is the authority.

Raw CSV and debug JSON files are canonical in the external archive after successful upload. Incoming experiment, participant, and session IDs are validated as safe path segments before archive keys are built. The VPS keeps only short-term spool files for pending/failed archives and an active lightweight SQLite/JSONL index. Retired indexes should be snapshot, optionally uploaded externally, pruned locally, and removed from the active tables.

## Submission v2

`POST /submit` still accepts `layouttask.receiver.submission.v1`. Formal client saves use
`layouttask.receiver.submission.v2` with flat snake_case fields:

- Both kinds require `submission_kind` (`trial` or `final`), `experiment_id`,
  `participant_id`, the experiment-level `session_id`, and all `/assign` fields:
  `assignment_id`, `participant_number`, `sequence_id`, `schedule_version`,
  `assignment_mode`, `requested_sequence_id`, `replacement_attempt`, and
  `rotation_index`. `requested_sequence_id` and `rotation_index` retain their
  `/assign` nulls.
- A trial also sends `trial_session_id`, `trial_type`, `task_id`, `qid`, `hash8`,
  `encoding`, and `encoded`; formal trials send `trial_index` and
  `presentation_id`. Its one JSON file must be a `layouttask.backup.v2` envelope
  with matching identity. Tutorial trials may omit the formal position fields.
- A final sends the existing file batch, including `session.csv` and
  `raw_results.csv`, and has no trial-only fields. Identity columns in both
  CSVs must match the request. `/archive` continues to use
  `layouttask.receiver.archive.v1` and the experiment-level session ID.

The receiver checks the assignment row and binds its first accepted v2
`participant_id` to that assignment. A different participant on the same
assignment is rejected. An identical trial result for the same
`(experiment_id, participant_id, session_id, trial_session_id)` or identical
final file batch returns HTTP 200 with the original `submission_id`; a new
submission returns HTTP 201. Changed content at the same identity returns
HTTP 409, as does a different valid assignment at the same submission identity.
Deduplication compares every assignment field; an otherwise identical trial retry
may change its backup `saved_at` without creating a new submission.
Invalid assignment or embedded file identity returns HTTP 400;
assignment binding conflicts return HTTP 409. Trials and finals share the
same archive session path and keep separate submission ID subdirectories.
An archived trial whose spool has already been removed is skipped during a
later session archive. `pending` describes archive state, not answer progress.
The added SQLite columns are nullable, so existing v1 rows remain v1 records.
The data directory also contains `.publication-lock.sqlite`,
`.jsonl-lock.sqlite`, and `.session-*.lock.sqlite`; these coordinate
concurrent receiver and retry processes and should remain on the shared
data volume while the service runs. Long archive copies lock only their
experiment session; unrelated submissions can still be published. After archive
I/O, the receiver checks the current session again. A same-session submission
accepted during that I/O remains pending and makes `/archive` return HTTP 503
with a non-success result and retry guidance. Retrying archives that submission
and skips targets already successfully archived.

## Replacement Participants

To request a replacement participant for sequence 6, append the sequence ID to the published static URL:

```text
https://your-static-host.example/experiment/?sequence=6
```

The URL parameter is a sequence ID request, not a participant number or authorization token. The client still calls `/assign`; the receiver allocates a fresh participant number and returns the authoritative sequence. Replacement assignments record their request and attempt number and do not advance the ordinary automatic rotation.

## Retry Failed Archives

```bash
docker compose exec receiver python -m app.retry_archive
```

## Clear Test Data

Stop public traffic or stop the stack first, then run:

```bash
docker compose exec receiver python -m app.archive_metadata
```

This snapshots the active SQLite/JSONL index before clearing it, then prunes local metadata snapshots according to `METADATA_ARCHIVE_LOCAL_KEEP`. In production, set `METADATA_ARCHIVE_RCLONE_REMOTE` and `METADATA_ARCHIVE_LOCAL_KEEP=0` if the VPS should keep no old index bundles after upload.

For disposable local test data where no metadata archive is needed, run:

```bash
docker compose exec receiver python -m app.clear_data
```

No public delete route exists. These commands operate on local spool and metadata only; they do not delete external object storage.

## Health Check

```bash
curl https://data.example.com/health
```

## Read-only legacy audit

Run the audit against a copied receiver data directory, one or more local exported archive directories, and the published schedule:

```bash
npx tsx tools/decoder/audit-legacy-submissions.ts --receiver-data receiver-data --archive exported-archive --schedule public/layout-task-run12-core23-preview/schedule.json
```

Repeat `--archive DIR` for additional local exports. Receiver-prefixed filenames such as `f003__layout_raw_results_P001_S001.csv` are supported. The command writes JSON to stdout and does not modify inputs, SQLite, or remote archives.

The report includes source paths and SHA-256 digests, per-trial linkage (`unique`, `ambiguous`, or `unmatched`), and proven experiment sessions classified as `tutorial_only`, `partial`, `formal_25_final_missing`, or `complete`. A v2 backup supplies explicit experiment identity; a v1 backup gains participant number and experiment session only through a unique matching final row. A known sequence or 25 backups never establishes either value; unmatched or ambiguous v1 trials remain `session_unknown`.

Counts require distinct presentation indices, IDs, and tasks matching the published 25-presentation schedule. `complete` requires 25 valid positions in one final CSV; partial final exports are not pooled into a complete final. Conflicting trial or assignment evidence is reported and affected counts are withheld.

Files covered by a manifest must match its declared full-file SHA-256 before
their contents can contribute verified positions or legacy linkage. Changed
files remain in the source evidence with an integrity issue; standalone legacy
CSV files without a manifest retain row/transport validation without claiming
manifest-backed file integrity. A malformed manifest, conflicting declaration,
or missing declaration in a directory with a manifest rejects the affected
file's evidence instead of treating it as a standalone file.

Archive state is independent of completion. When available, matching records in
`receiver-data/submissions.jsonl` supply current state ahead of the older
archive-time manifest state, with path/line provenance. Matching requires the
submission and file identity and digest; malformed, unmatched or conflicting
index evidence is reported rather than treated as proof of successful archive.
Contradictory current evidence and files rejected by SHA verification have
`unknown` archive state; their originally recorded state remains visible in
the evidence.
Manifest-only exports retain the recorded state and source, and absent metadata
gives `unknown`. A local export does not establish successful upload to every
remote target. Fatal input/argument errors produce JSON with `error` and exit
code 1; individual malformed records appear in `issues` alongside usable evidence.
