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

## Publication status

Implementation, tests and review completed. Source commit, receiver deployment and bilingual static publication pending at this checkpoint; this section will be updated with verified refs and production preservation evidence.

## Limits

No physical disk/power-loss test, real participant session or permanent-outage simulation. If both the first durable browser write and server transfer fail before the tab closes, those unsent bytes cannot be recovered. Temporary cloud failures retain VPS spool and retry after recovery; queued is never claimed as cloud-archived.
