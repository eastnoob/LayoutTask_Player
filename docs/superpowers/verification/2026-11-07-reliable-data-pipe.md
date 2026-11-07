# Reliable data pipe verification

Date: 2026-11-07, Europe/Berlin. Authorized scope: data transport, source push, receiver deployment, and self-contained Chinese/English static releases. UI, experiment operations, Run41 stimuli, scoring and sequence allocation remain unchanged.

## Implementation and review

- Metadata is a separate immutable v2 submission linked to the existing session/assignment. Native IndexedDB stores original file/request bytes and acknowledgements separately before transmission.
- `/submit` syncs files and commits SQLite before success. `/archive` returns 202/queued without cloud I/O. One worker retries persistent outstanding target states; spool cleanup requires all targets.
- Existing trial/tutorial/final serialization stays intact; unacknowledged trials replay before final archive/cleanup. A metadata-only failure retains backup silently.
- Independent final review: PASS, no Critical/Important findings. Cross-kind assignment conflicts, incomplete metadata, and interrupted archived-row cleanup all have regression coverage.

## Executed checks

| Check | Result |
| --- | --- |
| `$env:PYTHON='.pixi/envs/default/python.exe'; npm test -- --exclude 'tmp/**'` | 800 passed, 12 skipped; 70 files passed, 3 skipped |
| `npx tsc --noEmit` | Exit 0 |
| Fresh `npm run build` | Exit 0 |
| Python 3.12.16 and Pixi 3.14.7 focused receiver runs | 65 passed on each |
| Full receiver suite in isolated Linux container using production dependency image | 76 run, 75 passed, 1 Windows-only test skipped |
| Full workload byte comparison in two local archives | 27 submissions: metadata, tutorial, 24 formal trials, final; all original bytes matched; spool removed |
| Abrupt process-exit and restart cases | Four archived SQLite/JSONL/spool interruption cases passed without reupload or new historical target obligations |
| Both fresh package recursive validators | PASS, 0 failures |
| Current Run41 runtime validation | 23 unique tasks, 92 variable objects, 0 failures |

Authenticated Jianguoyun and Sciebo isolated probes both uploaded, downloaded and matched SHA-256 `f610cb6244d18e9da6854943faed8a8501fafa324c857c246e8de72f5309b2c9`. Probe directories were removed after verification; experiment archives were not changed.

Both packages contain byte-identical `assets/experiment-DR1H2b_B.js`, SHA-256 `8b8c503ba9b3813e2083c956878c3098f330f88f70a6092b56d5366171104d61`, complete Run41 assets and relative favicon paths. Language configs differ as intended.

## Browser acceptance

Fresh English WebKit: original consent/profile/Prolific flow reached tutorial with no new data-pipe UI. Metadata was stored in native IndexedDB after an initial transport failure; reload replayed the same bytes and original consent timestamp, received 201 before the first trial, and retained the same assignment/participant number. Local assignment count remained one. All four furniture reference boards and their SVG/GIF/icons loaded.

Chinese WebKit smoke reached the original tutorial/reference board with all displayed SVG/GIF/hand assets present, zero console errors and one existing plugin-definition warning. This Chinese smoke used developer mode after a local assignment request hit the same Windows connection reset; the English metadata/reload acceptance used an actual isolated assignment.

The local receiver is isolated from production and its sequence slots. Windows native loopback HTTP tests intermittently reset connections (`WinError 10054` / `ECONNRESET`); browser metadata acceptance used Playwright request proxying. The full HTTP receiver suite passes on Linux, the deployment platform. No OS/network protection settings were changed.

After separating the commit from preexisting worktree changes, its exported staged snapshot also passed 84 focused frontend tests and all 17 new receiver reliability tests. Preexisting Windows JSONL retry and unrelated Run41/reward/analysis edits remain in the working tree; they were not swept into this source commit.

## Publication and production acceptance

- Source implementation pushed: `4bce9bd54fa0b4745b1b0f07c44409888196d0b5`, branch `codex/run41-stimulus-migration`. Unrelated preexisting changes remain unstaged.
- Receiver deployed before clients, retaining the exact previous dependency image. New image: `sha256:1d87c260c48c09307d438c17e91fa468f0422cfcaba99f747151b9a7caf0b1d4`.
- All six changed receiver module hashes inside the running production container match the reviewed candidate/working artifact, including the earlier Windows JSONL fix already present on the deployed baseline.
- Secure VPS rollback snapshot: `/srv/agent/layouttask-receiver/backups/reliable-data-pipe-20261107T132138Z/`, containing source/config tar, full stopped-data tar, and SQLite backup. Prior image remains tagged `layouttask-receiver:before-reliable-pipe-20261107`. No data volume reset or assignment allocation was used for production tests.
- Production comparison against that SQLite snapshot preserves all 5 assignment rows, max participant number 5, all 156 original submission identities/content hashes, all 186 file identities/digests and all 80 previously archived submissions/target rows.
- Production config verified: both `jianguoyun` and `sciebo` for submissions and metadata indexes, retry interval 30 seconds, experiment `run_41_persistent`, schedule `run41-williams-repeat-constrained-v1`, 46 sequence IDs. Public `/health` returns `{"ok":true}`.
- Actual `/archive` request for an existing accepted session returned HTTP 202/queued in 6.41 ms while the worker copied backlog; later checks returned 5.87 ms and 4.05 ms. No cloud completion is claimed by that response.
- Real production worker readback: one previously pending file archived by the new worker was downloaded independently from both clouds. Both SHA-256 values match the original database digest `f36bc5f9f81d4382ea39d706ab9673e522e961b364b53d9a066df8dede38b819`.
- Chinese static `main`: `d86c19d60fe4e8358644efe13cd20b5fe52d15ae`.
- English static `en-US`: `b54752a1f7e84b554eda401b187cd50170ceaafa`.
- Exported each actual staged static tree excluding Git bookkeeping: all 156 files match the corresponding fresh package byte for byte; both recursive validators PASS with zero failures. Existing stimulus/tutorial/icon/CSS/config files have no changes in either static commit. Only the JS bundle, entry HTML and added explicit language config differ. Git checks account for the release repository's preserved CRLF (`core.whitespace=cr-at-eol`).
- GitHub Pages source remains `en-US`, root `/`. Latest build is `built` at `b54752a1f7e84b554eda401b187cd50170ceaafa`, no build error. Live `/experiment/` references `experiment-DR1H2b_B.js`; downloaded SHA-256 equals the verified package hash above. Chinese remote raw bundle has the same hash. Chinese is published to its static branch, not a separate Pages hostname.
- Live English WebKit consent page loads with zero console errors. Config, schedule and scoring reference requests return 200; public CSS, info/hand icons, manifest and representative stimulus JPG also return 200. Production browser used developer mode and did not consume an assignment slot.

Background backlog progress observed after rollout: 87 → 110 → 125 → 146 → 156 archived submissions. Final check: all 76 originally outstanding submissions completed both clouds, zero outstanding rows; Jianguoyun has 156 archived target rows and Sciebo has 76. The 80 already archived historical submissions remain unchanged, with no newly imposed Sciebo obligation. Final existing-session `/archive` returns HTTP 200/archived in 5.39 ms. All original identities, digests and 5 assignment rows still match the predeployment snapshot.

## Limits

No physical disk/power-loss test, real participant session or permanent-outage simulation. If both the first durable browser write and server transfer fail before the tab closes, those unsent bytes cannot be recovered. Temporary cloud failures retain VPS spool and retry after recovery; queued is never claimed as cloud-archived.
