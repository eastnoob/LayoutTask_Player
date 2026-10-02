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
ARCHIVE_RCLONE_REMOTE=layouttask-receiver:submissions
METADATA_ARCHIVE_RCLONE_REMOTE=layouttask-receiver:metadata-indexes
METADATA_ARCHIVE_DELETE_LOCAL_AFTER_UPLOAD=true
METADATA_ARCHIVE_LOCAL_KEEP=0
```

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
data/submissions.sqlite
data/spool/<submission_id>/        # pending or failed archive only
data/metadata_archives/<timestamp>/ # recent local archived indexes, pruned automatically
archive/<experiment>/...           # local development archive only
```

For the approved R12 deployment, replace the example sequence list with the
complete ordered sequence IDs from the published schedule. Do not let the
static frontend generate participant numbers; `/assign` is the authority.

Raw CSV and debug JSON files are canonical in the external archive after successful upload. Incoming experiment, participant, and session IDs are validated as safe path segments before archive keys are built. The VPS keeps only short-term spool files for pending/failed archives and an active lightweight SQLite/JSONL index. Retired indexes should be snapshot, optionally uploaded externally, pruned locally, and removed from the active tables.

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
