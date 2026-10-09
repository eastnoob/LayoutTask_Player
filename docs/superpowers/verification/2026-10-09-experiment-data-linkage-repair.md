# Experiment data linkage repair — final local acceptance

Date: 2026-10-09. Workspace: `C:/Users/tianf/.codex/worktrees/experiment-data-linkage/LayoutTask_Player`.

## Result and scope

The four reproduced receiver/audit findings are repaired and accepted locally. Two disjoint implementers supplied red/green evidence; independent reviewer Newton (`01a11dac-6bd6-7c33-a32d-5bfd53af753d`) initially reproduced three remaining audit gaps, then re-reviewed the frozen repairs and returned no Important or Critical findings. This is local receiver/audit acceptance, not repository-wide green status or production approval.

| Finding | Final behavior |
| --- | --- |
| Wrong-assignment duplicate acknowledgment | All eight assignment fields participate in trial/final deduplication. Different valid assignment returns conflict/HTTP 409, original record stays intact. Identical trial retries may change `saved_at`. |
| Archive result omits late same-session submissions | Finite archive I/O is followed by a current-state query under the short publication lock. Late pending submissions yield non-success/partial and retry guidance; retries skip successful targets. Unrelated publication remains unblocked. |
| Stale manifest archive status | Exact submission/file identity and digest matching permits current JSONL status with line provenance to override old manifest state. Invalid/conflicting exact-ID evidence becomes unknown; missing/unmatched evidence retains explicit fallback provenance. |
| Declared file SHA not enforced | Original file bytes must match declared manifest SHA before contributing verified counts or linkage. Rejected backups cannot retain archived proof. Malformed, duplicate or missing declarations cannot turn protected files into standalone legacy evidence. |

Additional concrete issue exposed by the new checksum check: native Python text writes changed CSV LF bytes after hashing. `receiver/app/storage.py` now writes submitted UTF-8 bytes directly, with a real archived-byte regression. Historical data and recorded hashes were not rewritten.

Participant number and sequence/order remain separate authoritative `/assign` values. Actual integration checks automatic `(1, 6)` and replacement `(2, 7)` through client output, Python receiver, final archive and read-only audit. Tutorial-only, partial, 25-without-final and complete statuses remain distinct. Uniquely unproven legacy records remain `session_unknown`.

## Final evidence

Worker source-byte fingerprints are recorded in `2026-10-09-receiver-repair.md` and `2026-10-09-audit-repair.md`; owner/reviewer checked the frozen source. No implementation edits followed the final runs below.

| Check | Observed result |
| --- | --- |
| Owner final client/audit/integration command | With bundled `PYTHON`, `npx vitest run src/core/data-save-service.test.ts src/experiment-runner.test.ts tools/decoder/audit-legacy-submissions.test.ts tools/decoder/data-linkage-integration.test.ts --reporter=dot`: exit 0, 127/127 passed, four files. |
| Native receiver storage, worker frozen state | 33/33 passed; native in-process HTTP handler 2/2 passed. |
| Full WSL receiver, worker frozen state | 58 tests in 18.187s, OK, exit 0. |
| Worker final full frontend, original checkout | Bundled `PYTHON`, `npm test -- --reporter=dot`: exit 1, 626 passed / 7 failed, 66 files. All affected audit/integration tests passed. |
| Owner final TypeScript check | `npx tsc --noEmit`: no diagnostics; corroborated by final build's required `tsc`. |
| Owner final build | `npm run build`: exit 0; 99 modules, Vite build completed. |
| Owner release validator after that build | `npm run validate:web-release`: exit 0, `{"ok":true,"failures":[]}`. This validator's success does not override tutorial-lock test failures. |
| Independent final scoped re-review | 21 audit edge regressions, six receiver dedup/race regressions, two in-process HTTP regressions and native UTF-8 integrity check passed. No Important/Critical findings. |
| Whitespace | `git diff --check`: exit 0; normal checkout LF/CRLF notices only. |

The owner's first final audit/integration invocation omitted `PYTHON`: audit 66/66 passed, integration failed because `python3` resolved to the Windows Store alias. Setting `PYTHON=C:/Users/tianf/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe` produced the 127/127 result above. This was an invocation prerequisite, not a skipped integration test.

An earlier owner run during the implementer's red phase observed six audit failures / 121 passes. It is superseded by the frozen-source evidence. Earlier build checks and intermediate WSL integration results are not used in place of final checks.

## Corrected baseline assessment: seven failures are not solely CRLF

The original checkout encounters the first locked tutorial SVG mismatch, masking later mismatches. The previous report's classification of all seven failures as exclusively CRLF was incomplete.

The owner copied tracked and nonignored untracked files (1,203 files) into `C:/Users/tianf/AppData/Local/Temp/layout-linkage-validation-dtFJw1/snapshot`, linked existing dependencies, and changed only proven canonical asset bytes in that temporary validation copy. Source assets, lock files and lock checks were never changed. For each correction, in-memory CRLF-to-LF bytes had to equal the HEAD blob and the blob SHA had to equal the existing lock. Twelve files across the four tutorial directories met that condition (background SVG, behaviors JSON, task JSON); 159 declarations already matched. Nine other declarations did not meet it and were preserved unchanged.

The first temporary full run, correcting only the original SVG, was still 626 passed / 7 failed; it exposed behaviors JSON and the preview SVG. After all twelve proven newline-only corrections, the complete temporary run remained **626 passed / 7 failed**, exit 1: six failures reported `generation-report.json`, one reported the preview PNG `assets/images/stimulus/edc634ac7856_perspective_stimulus_1920x1080.png`. HEAD SHA also differs from the lock for generation-report and manifest in all four directories, and for that preview PNG. These are existing asset/lock discrepancies beyond newline conversion. Full detail is in the retained temporary `snapshot-evidence.json`; the validation script refused to replace those unresolved bytes or alter any lock.

Representative immutable baseline values:

| File | HEAD SHA-256 | Lock SHA-256 |
| --- | --- | --- |
| Tutorial `generation-report.json` | `a8d20e8f0079d67c40a20f16d275b87cb91641ba5b593c66863a7d1da5f32df8` | `d8a5f2daa45f0775205969171ceb9056b41a309f0b10b185f17b65a8c440b871` |
| Tutorial `manifest.json` | `f128e01925d450adfc7ccaa5fe586058dbef614a92a8e49373f27970120e426b` | `302281eccf201d023924bf5c28ecab25cdd81fa63ea19289d647c415af18a374` |
| Preview tutorial PNG | `4812c83e9931b41e0849712c2a91c923c47353438bb819fb95b1f11e383e2cc6` | `757d816967d051030d09b2a93c34cd1f3436c19d886b201be16ac2c3ef507ff8` |

This receiver/audit repair does not authorize choosing new experimental asset bytes or refreshing material locks. Repository-wide tutorial/release acceptance remains open. No all-green claim is made.

## Limits and handoff

Windows native socket tests remain limited by WinError 10054, reproduced in both a bare standard-library HTTP server and receiver health. WSL covers the full receiver suite; native storage and handler checks pass. The precise Windows networking/runtime cause was not established or patched.

Historical native archives may already have inconsistent CRLF bytes and recorded LF hashes. The prospective byte-write fix preserves original historical evidence; strict audit surfaces those mismatches rather than silently repairing them.

No commit, push, merge, VPS access, deployment, production configuration change, external archive mutation, original asset or lock edit, or Blender operation occurred. Receiver-first deployment and controlled live verification remain unperformed. User permission is not needed to accept these completed local repairs; deployment and experimental-material reconciliation are separate work.
