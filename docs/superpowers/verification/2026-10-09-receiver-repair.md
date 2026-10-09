# Receiver repair Task 1 verification

Date: 2026-10-09 (local). Worktree: `C:/Users/tianf/.codex/worktrees/experiment-data-linkage/LayoutTask_Player`.

## Scope and source freeze

Implemented receiver repair Task 1 only from `docs/superpowers/plans/2026-10-09-experiment-data-linkage-repair.md`. Read the approved `docs/superpowers/specs/2026-10-08-experiment-data-linkage-design.md` and original findings in `docs/superpowers/verification/2026-10-08-experiment-data-linkage.md`. Applied systematic-debugging, TDD with `writing-good-tests.md`, Ponytail, and verification-before-completion. Existing uncommitted implementation was preserved. No other files, commits, external/VPS operations, assets, locks, or subagents were changed or created by this repair. The owner's README edits and parallel audit edits are outside this worker's deliverable.

Changed paths:

- `receiver/app/storage.py`
- `receiver/tests/test_storage.py`
- `receiver/tests/test_server.py`
- `docs/superpowers/verification/2026-10-09-receiver-repair.md`

Final implementation and test files were frozen at **2026-10-08T22:43:37Z**, before completion of the final verification commands. No source edits followed that freeze; this report was written afterward. SHA-256 of actual file bytes (including checkout line endings):

| Path | SHA-256 |
| --- | --- |
| `receiver/app/storage.py` | `180589FC599A45200ECD163EEC0F62EBD72D3939E54AD0F56336AD3399D511CA` |
| `receiver/tests/test_storage.py` | `E96071A8D48FA54DA259F8DB8360F547D1690EB26B35CF8F1B86E09CDF40CB4E` |
| `receiver/tests/test_server.py` | `9CAB24DEF6E85DEBAA38538F25D66D2CE782851EE59AFBA07DA570DEA90F5FF8` |

## Behavior and evidence

Observed root cause: `_existing_v2` compared content SHA-256 and trial fields but omitted assignment fields. The repair compares all eight `ASSIGNMENT_FIELDS` for both trial and final submissions, plus all persisted trial fields for trials. The complete encoded payload is still compared by SHA-256. `saved_at` changes remain permissible through the existing regression. Request validation and response shapes are unchanged.

`test_v2_duplicate_rejects_different_valid_assignment` uses two valid allocated assignments and internally consistent backups with the same trial identity and encoded content. The second assignment now raises `submission_conflict`; an exact retry returns the original ID with `duplicate=True`. SQLite retains one submission, the original assignment stays bound to P47, the second stays unbound, and original spool/index bytes are unchanged. A separate test alters each persisted assignment column independently and requires conflict on a valid retry for both trial and final kinds: 16 subcases protect metadata comparisons independently of the content digest. These are deliberate isolated database fixtures, not normal request-side assignment changes.

Observed archive root cause: the original result used only the pre-I/O IDs. The repair retains the finite original upload snapshot and per-session archive lock. After I/O and original successful-snapshot cleanup, it queries current session IDs/statuses once under the publication lock and constructs the result while that lock is held. The no-I/O success path also returns under the publication lock. Publication is never locked across external archive I/O or spool cleanup. A session with archived and pending rows reports `ok=False`, `archive_status='partial'`, and an explanation to retry. An entirely pending current snapshot reports pending; target failures retain failed/partial behavior. No unbounded loop or new lock order was introduced.

`test_archive_session_reports_late_same_session_submission` coordinates two spawned processes with events: pause T1's real local archive I/O, accept and publish T2 in the same session before releasing I/O, then check partial plus a retry explanation. JSONL contains T1 archived/T2 pending; T1's successfully archived snapshot spool is removed and T2's spool remains recoverable. The next session archive uses the real local backend, archives exactly T2, preserves its backup content, and removes its spool. A third call is already archived and performs no additional upload. The existing unrelated-session publication regression and cross-process archive/retry serialization regression remain passing.

HTTP regression extends `test_v2_status_codes_without_network_stack` using the real request handler: first acceptance is 201, unchanged retry 200, changed encoded content 409, and changed valid assignment 409 with `error='submission_conflict'`.

### Owner-routed native byte-integrity repair

The owner added the native integrity finding within the user's authorization for complete scoped repairs. Confirmed that native `Path.write_text(data, encoding='utf-8')` translates LF to CRLF, while the receiver records SHA-256/size of `data.encode('utf-8')`. This is a real stored-byte mismatch, independent of socket fixtures. The only production change for this finding is `file_path.write_bytes(submitted_file.data.encode('utf-8'))`; incoming UTF-8 bytes, including existing line endings, now match the recorded digest and size on both platforms. No historical files or recorded hashes were rewritten.

Extended `test_save_submission_archives_files_and_indexes_each_file` to compare actual archived bytes with submitted UTF-8 bytes and verify manifest SHA-256 and byte size for both files using the real local archive backend. Existing text-mode assertions previously hid newline translation. Before the fix the native test failed with `b'a\r\n1\r\n' != b'a\n1\n'`.

## Commands and red/green results

All native commands below run from the worktree's `receiver` directory. `PY` in this report denotes the exact native executable `C:/Users/tianf/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`; the actual PowerShell invocation is `& '<that absolute path>' ...`.

| Stage | Command | Exact result |
| --- | --- | --- |
| Storage red, before repair | `PY -m unittest discover -s tests -p 'test_storage.py' -q` | Exit 1; 33 tests in 9.859s, 18 failures, 0 errors: wrong valid assignment (1), stored assignment fields for trial/final (16), late publication false success (1). |
| First candidate | Same native storage command | Exit 1; 33 tests in 10.424s, 1 failure: late-publication regression reached its cleanup assertion because the first re-snapshot candidate kept the successfully archived T1 spool. Final implementation restores original upload-snapshot cleanup before the final result snapshot. |
| Intermediate storage green | Same native storage command | Exit 0; 33 tests in 9.786s, OK. This was an intermediate state, superseded below. |
| Incorrect direct HTTP test invocation | `PY -m unittest tests.test_server.ServerTests.test_v2_status_codes_without_network_stack -q` | Exit 1; 1 loader error: `ModuleNotFoundError: No module named 'test_storage'` because this fixture expects unittest discovery's test-directory import path. Corrected to discovery below; no source import workaround added. |
| HTTP green, first discovery run | `PY -m unittest discover -s tests -p 'test_server.py' -k 'v2_status_codes' -q` | Exit 0; 1 test in 0.149s, OK. |
| HTTP red mutation check | Same targeted HTTP discovery command, temporarily restoring the old metadata comparison, then restoring the fix | Exit 1; 1 test in 0.165s, 1 assertion failure: `(201, 200, 409, 200)` instead of `(201, 200, 409, 409)`. |
| Pre-byte-fix storage green | Native storage discovery command | Exit 0; 33 tests in 11.740s, OK. |
| Pre-byte-fix WSL green | Full WSL command below | Exit 0; 58 tests in 20.211s, OK. |
| Native full-suite diagnostic, before byte repair | `PY -m unittest discover -s tests -p 'test_*.py' -q` | Exit 1; 58 tests in 20.972s, 10 errors, all `ConnectionResetError: [WinError 10054]`; no assertion failures. Names listed below. |
| Native in-process HTTP diagnostic | `PY -m unittest discover -s tests -p 'test_server.py' -k 'without_network_stack' -q` | Exit 0; 2 tests in 0.383s, OK. |
| Native byte-integrity red | `PY -m unittest discover -s tests -p 'test_storage.py' -k 'save_submission_archives_files_and_indexes_each_file' -q` | Exit 1; 1 test in 0.097s, 1 byte-equality assertion failure, 0 errors. |
| **Final native storage** | `PY -m unittest discover -s tests -p 'test_storage.py' -q` | **Exit 0; 33 tests in 11.835s, OK.** Includes the repaired native byte-integrity regression. |
| **Final native HTTP without network stack** | `PY -m unittest discover -s tests -p 'test_server.py' -k 'without_network_stack' -q` | **Exit 0; 2 tests in 0.284s, OK.** |
| **Final full WSL receiver suite** | Full WSL command below | **Exit 0; 58 tests in 18.187s, OK.** |

Exact requested full WSL command, run from the worktree root:

```powershell
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/tianf/.codex/worktrees/experiment-data-linkage/LayoutTask_Player/receiver && python3 -m unittest discover -s tests -p "test_*.py" -q'
```

At source freeze, the scoped whitespace check was `git diff --check -- app/storage.py tests/test_storage.py tests/test_server.py` from `receiver`: exit 0, no whitespace defects. Git emitted its normal LF-to-CRLF working-copy notices; no source normalization was performed.

### Native socket limitation

The native full-suite diagnostic's 10 error records were:

- `test_built_experiment_urls_use_receiver_and_authoritative_sequence`: subtest `static package keeps both query forms routable`.
- Same built-package test: subtest `receiver allocates identity and honors replacement sequence`.
- `test_accepts_datapipe_compat_route`.
- `test_accepts_valid_submit_with_token_and_cors`.
- `test_assigns_and_repeats_assignment`.
- `test_assigns_requested_sequence_and_increments_replacement_attempt`.
- `test_rejects_assignment_with_unknown_schedule`.
- `test_rejects_disallowed_origin`.
- `test_rejects_malformed_or_unknown_requested_sequence_without_creating_assignment`.
- `test_rejects_token_mismatch`.

A bounded native stdin Python diagnostic issued ten GETs each against (a) a bare `ThreadingHTTPServer` with a minimal handler returning two bytes and (b) the receiver `/health` handler. The control produced 5 HTTP 200s and 5 WinError 10054 resets; receiver health produced 7 HTTP 200s and 3 resets. Both recorded all 10 entries into `finish_request`. This reproduces resets without receiver request/storage fixtures and establishes that the issue is not specific to this repaired storage path. It does not establish the Windows networking/runtime root cause. No in-scope `test_server.py` fixture cause was found, so no speculative retry, skip, networking workaround, or production-server edit was added. The final byte-write change does not address this socket limitation; the native full suite was not repeated afterward.

## Acceptance and remaining work

Task 1's receiver defects and the explicitly added native stored-byte defect have covering red/green evidence on the frozen source. Public storage interfaces, v1 compatibility, assignment validation, duplicate response shape, and session/publication lock order remain intact. The requested final native storage and full WSL checks pass. The complete native network suite remains unverified because of the concrete reset limitation above.

The owner reported that independent reviewer Newton had started. This worker did not create, contact, or claim a verdict from a subagent. Independent review, audit-worker acceptance, combined Task 3 closure, receiver-first deployment, and live archive verification remain with the owner; this report does not assert any of those outcomes. No user confirmation or material design escalation is required for these scoped fixes. Historical native archives may already have recorded UTF-8 hashes inconsistent with translated CRLF bytes; preserving those originals means this prospective write fix does not retroactively repair them.
