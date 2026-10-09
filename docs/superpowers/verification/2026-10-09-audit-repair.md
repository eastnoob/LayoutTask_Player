# Audit repair verification — Task 2

Worktree: `C:/Users/tianf/.codex/worktrees/experiment-data-linkage/LayoutTask_Player`.
Task source: `docs/superpowers/plans/2026-10-09-experiment-data-linkage-repair.md`, Task 2 only.
Approved design: `docs/superpowers/specs/2026-10-08-experiment-data-linkage-design.md`.
Original reproduced findings: `docs/superpowers/verification/2026-10-08-experiment-data-linkage.md`, audit stale-status and full-file checksum findings.

## Scope and final source handoff

This repair changed only:

- `tools/decoder/audit-legacy-submissions.ts`
- `tools/decoder/audit-legacy-submissions.test.ts`
- `tools/decoder/data-linkage-integration.test.ts`
- This verification report.

Existing dirty implementation was preserved. Receiver changes belong to the parallel receiver worker; README changes belong to the owner. No other source, assets, locks, dependencies, historical data, production configuration, external archives, commits, or subagents were changed or created by this worker. All local edits used `apply_patch`.

The three implementation/test files stopped changing before final targeted validation, type checking, and the full npm run. Only this report was written afterward. SHA-256 of that frozen source snapshot:

| Path | SHA-256 of original checkout bytes |
| --- | --- |
| `tools/decoder/audit-legacy-submissions.ts` | `5fa570c576ce1c95d5cf81c22e31e858574469fd9fe55538bb6495b6ca7d7ae8` |
| `tools/decoder/audit-legacy-submissions.test.ts` | `814bde6978395a3b33381fa7f1d2a6cb39faedfdc852b88ac5dc51ab0312c237` |
| `tools/decoder/data-linkage-integration.test.ts` | `29da0cd4831e708f0d6ebccdedc48dc8a520690bff2cf65a751755df09c3e067` |

## Repair behavior and precedence

The original audit read archive-time manifest status, although actual receiver archival updates the current JSONL index. It also recorded source SHA-256 without enforcing the manifest's existing full-file integrity reference. Transport `hash8` can omit events, so a valid encoder-view hash cannot replace a file checksum.

The audit now reads optional `receiverData/submissions.jsonl` without writing it. Index source SHA-256 is retained, and archive evidence carries the index path and physical line number. Current status applies only after exact submission ID, explicit experiment/participant/session identity, corresponding declared assignment/trial metadata, and file identity match. File identity comparison includes `file_index`, `file_id`, `filename`, `archive_filename`, `sha256`, and `size_bytes`. No identity is inferred from directory names, participant numbers, or sequence IDs.

| Evidence | Effective status and provenance |
| --- | --- |
| One valid exact current index record | Current receiver status overrides stale manifest status; `kind: receiver_index`, path/line, submission/file IDs. |
| Index absent | Manifest's recorded status remains, with `kind: manifest` and `fallback_reason: receiver_index_absent`. |
| Valid but unmatched index record | Manifest fallback remains explicit, with unmatched/mismatch issues and `receiver_index_unmatched`; unrelated status is never applied. |
| Malformed line without a usable submission ID | Visible path/line issue; no inferred association. Any manifest fallback is explicitly unmatched. |
| Invalid record with the exact submission ID, or duplicate/conflicting records for that ID | Effective state is `unknown`; manifest provenance and `recorded_state` retain the old claim. Fallback reason identifies invalid/conflicting current evidence. |
| Rejected backup bytes | Trial is invalid and effective archive state is `unknown`; evidence preserves the recorded claim/provenance and reports `file_integrity_rejected`. |
| No manifest or current matched evidence | Archive status is unrecorded/unknown. |

Submission/file status inconsistencies, malformed records, duplicate identities, and unmatched evidence are surfaced in `issues`. Conflicting records do not receive last-wins treatment.

Before final CSV rows contribute evidence, or backup contents are accepted, the audit compares declared manifest SHA-256 with the original byte buffer. Missing, invalid, or mismatching declared checksums reject the file. Rejected final files contribute no verified positions or legacy matches. `file_integrity` reports verified/rejected/unverified status, actual and declared checksums, and manifest provenance; `sources` retains original hashes, including rejected files. Input snapshots and CLI tests verify byte preservation.

An existing malformed manifest, invalid `files`, an unlisted file, or duplicate file declarations cannot turn a protected CSV into a standalone file. These are rejected with visible issues. Truly standalone legacy CSVs remain supported by existing row/transport validation and are explicitly marked `unverified` for full-file integrity; no manifest proof is claimed.

Protected fixture files now declare real digests and complete file identity metadata. Regressions cover event changes outside the encoded transport view, changed backup bytes, missing/invalid checksums, fallback provenance, mismatched identity fields, and contradictory index records.

## Observed red and green evidence

All counts below are observed, not projected. Intermediate runs are preserved to distinguish expected red regressions and fixture/expectation corrections from final validation.

| Check / source stage | Result |
| --- | --- |
| Initial targeted red, both audit/integration files | Exit 1: 35 failed / 25 passed, 60 tests. Included stale pending-vs-archived integration behavior and missing checksum/index enforcement. |
| Intermediate targeted repair | Exit 1: 16 failed / 44 passed, 60 tests; included native receiver CSV newline mismatch and partial-object matcher corrections. |
| Earlier targeted green using WSL receiver | Exit 0: 60 passed, 59 audit + 1 integration. Superseded by final native validation below. |
| New edge-case red, audit filter `keeps an archived manifest\|does not give changed backup\|does not accept protected files` | Exit 1: 6 failed / 1 passed / 59 skipped, 66 tests. Owner independently observed the same six failures. |
| Strengthened duplicate-manifest red, filter `duplicate_file manifest` | Exit 1: 1 failed / 65 skipped, 66 tests; invalid duplicate placed before valid declaration exposed last-wins acceptance. |
| After edge-case fixes, audit suite | Exit 1: 1 failed / 65 passed, 66 tests; older malformed exact-ID assertion still expected pending instead of unknown. |
| After updating that expectation, audit suite | Exit 1: 2 failed / 64 passed, 66 tests; malformed lines without IDs correctly remained unmatched rather than being assigned an identity. Expectations were separated into literal cases. |
| Final targeted audit + native integration | Exit 0: 67 passed, 66 audit + 1 integration, 2 passing files; duration 5.04s. |
| Final `npx tsc --noEmit` | Exit 0, no diagnostics. |
| Single full `npm test -- --reporter=dot` | Exit 1: 626 passed / 7 failed, 633 tests; 64 passing / 2 failing files, 66 files; duration 8.10s. Audit 66/66 and integration 1/1 passed within this run. |

Final targeted command:

```powershell
$env:PYTHON = 'C:/Users/tianf/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
npx vitest run tools/decoder/audit-legacy-submissions.test.ts tools/decoder/data-linkage-integration.test.ts --reporter=dot
```

The same bundled `PYTHON` was set for the single full npm run. The final integration directly spawns `PYTHON` (or `python3` when unset), with no WSL dependency or CSV normalization. It exercises actual receiver validation, storage, background retry, spool deletion, final archive, and duplicate handling for both automatic `(participant 1, sequence 6)` and replacement `(participant 2, sequence 7)` assignments. Tutorial-only, partial, 25-without-final, and complete sessions assert `archive_state: archived`; final trials assert matched receiver-index provenance. Read-only audit snapshots remain byte-identical.

Earlier native evidence exposed a concrete receiver bug: `Path.write_text` translated submitted CSV LF bytes to CRLF after the manifest digest had been computed. The temporary integration WSL bypass was removed. The parallel receiver worker changed the payload writer to `write_bytes`; final bundled native integration passes against that shared receiver source. This report does not claim the audit worker implemented or independently verified the worker's complete receiver regression suite.

## Seven known full-suite failures

All seven report `Locked file sha256 changed: assets/backgrounds/room_scene_0001_bg.svg`. The original verification report establishes the checkout CRLF-vs-locked-LF mismatch. No assets or lock checks were changed or weakened.

`src/core/tutorial-package.test.ts` / `tutorial package`:

1. `passes the fixed package lock and keeps every board asset inside the package`
2. `publishes an independently loadable R12 tutorial copy`

`tools/generator/compile-batch.test.ts` / `compileBatchToDirectory`:

1. `copies only assets referenced by the compiled runtime package`
2. `compiles protocol examples into self-contained runtime packages`
3. `copies the verified tutorial package into the release output without changing the source`
4. `emits a validated 25-presentation schedule for the real R12 batch`
5. `prefers the unified project assets for referenced runtime files`

## Review handoff and limits

The owner relayed Newton's independent reproduction of the three additional gaps: unusable manifests being accepted as standalone (P1), invalid/duplicate index records retaining stale archived fallback (P2), and checksum-rejected backups retaining archived evidence (P2). The frozen source fixes all three, with covering regressions in the final 66-test audit suite. Newton's final re-review result is pending and is not claimed here.

Task 2 implementation and its required local evidence are complete. The raw checkout full frontend suite remains red only for the seven known tutorial-lock failures. The owner's LF-canonical temporary-copy full validation, independent final re-review, combined acceptance, build/release checks, receiver full-suite closure, and deployment are outside this worker's report; no results are asserted for them. No unnecessary repeat green checks were run after final validation.
