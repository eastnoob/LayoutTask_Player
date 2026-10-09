# VPS receiver deployment acceptance

Date: 2026-10-09 (Europe/Berlin; verification completed around 2026-10-08 23:12 UTC).

## Result and scope

The repaired receiver is running on `vmi3468425`, at `/srv/agent/layouttask-receiver`, behind `https://datapipe.eastnoob.top`. Deployment and controlled live verification were authorized by the user's request to update the VPS and pass tests.

Only `receiver/app/models.py`, `server.py`, and `storage.py` were replaced. The receiver image was rebuilt with the production Dockerfile. Frontend publication, experimental assets/locks, compose, `.env`, Dockerfile, rclone credentials/configuration, proxy, historical submissions and historical assignments were not changed. No commit or push occurred.

Deployed image: `layouttask-receiver:linkage-20261009`, also tagged with the existing compose image name `layouttask-receiver-layouttask-receiver:latest`.

Image ID: `sha256:e8d13eccb30dd33b21cad2c88540fa1309fff1d2d8f457aef6aeb40ba50734df`.

The running container's source hashes match the accepted candidate:

| Source | SHA-256 |
| --- | --- |
| models.py | `53169e07347ed249ecf40555ec02d7add265e6abd04ac113a4f428e7af60745e` |
| server.py | `4731c2b1356e6d7689fe4788f219377483addf280049b6bff3f64646f8043255` |
| storage.py | `180589fc599a45200ecd163eec0f62ebd72d3939e54ad0f56336ad3399d511ca` |

## Verification

| Check | Observed result |
| --- | --- |
| Candidate receiver suite before switching | 58/58 passed, 36.575 seconds, exit 0. |
| Receiver suite using the deployed image after switching | 58/58 passed, 35.352 seconds, exit 0. |
| Isolated migration of a real database copy | Original rows/columns and JSONL bytes preserved; SQLite integrity `ok`; legacy submissions retain null v2 kind. |
| Order configuration | All 46 configured sequence IDs match the staged schedule in order; all 17 existing assignments match their sequence/rotation. |
| Public HTTPS health | Five initial checks and final check returned HTTP 200 / `{"ok":true}`. |
| Public CORS preflight | HTTP 204 with expected origin. |
| Invalid production assignment request | HTTP 400; no production participant number allocated. |
| v2 automatic and replacement fixtures | Independent test experiment: automatic `(number=1, sequence=6, rotation=0)` and replacement `(number=2, sequence=7, rotation=null)`. |
| Trial/final submission and retry | HTTP 201 on new records; HTTP 200 with original IDs on identical retries. Trial retry changing only `saved_at` is accepted. |
| Conflict rejection | Changed trial data and different valid assignment return HTTP 409; inconsistent participant number returns HTTP 400. |
| Legacy v1 compatibility | CSV containing Chinese UTF-8 text accepted. |
| Public session archive and retry | Both sessions return HTTP 201 / archived, then HTTP 200 / archived on retry. |
| Actual Jianguoyun and Sciebo archives | Five submissions verified on both targets: ten manifests checked for submission/session identity and all eight v2 assignment fields plus submission kind where applicable. |
| Remote file integrity | Fourteen byte comparisons passed, including declared SHA-256 and byte length. |
| Archive cleanup | All five test submissions and ten target states are archived; local test spools removed after success. |
| Final production runtime | Correct image, running, restart count 0; receiver logs contain startup and no application errors; original mounts and environment values preserved. |

The full suite ran in an isolated test container using the deployed receiver image. It did not run destructive test fixtures against production data. Live public requests used a dedicated test experiment; fixture assignments were created directly in that experiment because public `/assign` is configured for the real experiment.

Final suite command on VPS:

```sh
docker run --rm \
  -v /srv/agent/layouttask-receiver/deployment-20261009-linkage/project:/verification:ro \
  -w /verification/receiver -e PYTHONPATH=/app \
  layouttask-receiver:linkage-20261009 \
  python -m unittest discover -s tests -v
```

## Historical data preservation and current counts

Post-test comparisons used the original stopped-service backup, not the already migrated database. Every historical row, original spool file byte, and original JSONL line remains unchanged. SQLite integrity is `ok`. Fixed production configuration hashes remain equal.

| Item | Before | After | Explanation |
| --- | --- | --- | --- |
| submissions | 366 | 371 | Five marked deployment-test submissions. |
| submission_files | 426 | 433 | Seven test files. |
| assignments | 17 | 19 | Two assignments only in the test experiment; all 17 production rows unchanged. |
| archive_targets | 8 | 18 | Ten test target records. |
| receiver_logs | 0 | 0 | No new database log rows. |
| Historical spool files | 704 | 704 unchanged | Original file bytes verified. |
| Historical JSONL lines | 366 | 366 unchanged | Original line prefix verified after new test records. |

Original experiment counts remain:

- `run_12_core_23_persistent`: 226 submissions = 8 archived + 218 pending; 17 automatic assignments, maximum participant number 17, maximum rotation index 16.
- `run_12_core_23_debug`: 140 submissions = 6 archived + 134 pending.
- Added `deployment_check_20261009_linkage`: five archived test submissions and two fixture assignments. Exclude this experiment from research analysis.

These are submission records, not counts of complete participants or formal tasks.

## First switch, correction and recovery

The first switch failed an overly strict assertion comparing environment-variable arrays in their original order. The script automatically restored the old source and image without rolling back data. Public health was verified after rollback.

A stopped disposable container created with the candidate image and compose environment confirmed that every environment value matched the running old container, while array order differed. The deployment assertion was corrected to compare environment key/value mappings; mount and configuration preservation checks remained active. The second switch passed and explicitly recorded `environment_values_unchanged=true`, `environment_list_order_unchanged=false`.

Both consistent stopped-service backups and the old image remain available:

- Original backup: `/srv/agent/layouttask-receiver/deployment-20261009-linkage/backup-before-switch`.
- Second-attempt backup: `/srv/agent/layouttask-receiver/deployment-20261009-linkage/backup-before-switch-attempt2`.
- Old tag: `layouttask-receiver:before-linkage-20261009`.
- Old image ID: `sha256:8f5bb11508bb9e3008e336c0a02121f25cbf5a9b4b2beb66ccca6d3c570844a2`.

The new nullable schema remains compatible with the old receiver. A future rollback must preserve newly received data; do not restore an old data snapshot over new submissions.

## Retained evidence and limits

VPS evidence directory: `/srv/agent/layouttask-receiver/deployment-20261009-linkage`.

- `switch-result.json`: final image, source hashes, unchanged configuration and environment values.
- `receiver-tests.log`: complete 58-test final run.
- `live-smoke.log`: all live checks and final `live_acceptance` result, exit 0.
- `preservation-final.json`: historical-row/file/JSONL preservation results.
- `live-smoke.py`, `preservation.py`, `migration-check.py`, `switch.py`: executed verification/deployment scripts; staged candidate source and predeployment database copy are retained.

Copies of final logs/results are at `C:/Users/tianf/AppData/Local/Temp/layouttask-vps-deploy-20261009`. This report is saved in the repair worktree.

Only the VPS receiver is released. New client-generated v2 identity metadata still requires the separate frontend publication. The live fixtures exercise receiver transport, linkage, deduplication and real remote archives; the trial encoded text is a marked placeholder, so this does not certify a completed 25-task participant run or decoding actual experimental results. Historical unprovable links and pending records were not rewritten or bulk archived. The repository's previously documented seven unrelated asset/lock test failures remain outside this deployment.
