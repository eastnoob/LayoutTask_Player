# Layout Task Receiver

This service receives completed Layout Task experiment files from a static frontend.

## Deployment

1. Point `data.example.com` to the VPS.
2. Copy `Caddyfile.example` to `Caddyfile` and replace the domain.
3. Create `.env`:

```text
ALLOWED_ORIGINS=https://your-github-pages-site.example
SUBMIT_TOKEN=public-study-token
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

## Data

Accepted submissions are stored in:

```text
data/submissions.jsonl
data/submissions.sqlite
data/spool/<submission_id>/        # pending or failed archive only
data/metadata_archives/<timestamp>/ # recent local archived indexes, pruned automatically
archive/<experiment>/...           # local development archive only
```

Raw CSV and debug files are canonical in the external archive after successful upload. The VPS keeps only short-term spool files for pending/failed archives and an active lightweight SQLite/JSONL index. Retired indexes should be snapshot, optionally uploaded externally, pruned locally, and removed from the active tables.

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
