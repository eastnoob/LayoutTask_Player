# Missing-final archive fallback specification

Date: 2026-11-13. Status: approved design carried forward from the user's reviewed note; implementation authorized in this session.

Source: `docs/notes/2026-11-13-vps-missing-final-fallback-design.md`, including its 15-question audit and 35 acceptance scenarios. This specification makes those decisions executable; it introduces no new participant-facing behavior.

## Scope and authority

Modify the Python receiver only. Preserve frontend UI, URLs, Chinese/English packages, stimuli, scoring, Pause, experiment timing, sequence allocation and stored submission bytes/paths. Keep the existing worker, SQLite, process locks, dual archive targets and retry mechanism; add no dependencies or upload pool. The user's authorization covers spec, workplan, implementation and the existing receiver deployment workflow. Existing unrelated working-tree changes remain outside this branch.

## Completion and archive eligibility

`data_complete=true` continues to require metadata, required tutorial, exactly N formal trials with indices 1..N and unique trial/presentation identities, a client final and its matching raw-results CSV. Missing-final fallback never reports participant success, manufactures a final, or changes `/archive`'s HTTP 409 incomplete response.

Fallback may back up an immutable, validated set of metadata/tutorial/formal submissions while `data_complete=false`. A later accepted but invalid final cannot stop retries of that previously validated set. An invalid final present before any fallback qualification cannot create fallback qualification. Normal completeness failures preserve the last valid manifest instead of erasing it.

## Persistent state

Add nullable `final_wait_started_at TEXT` and `fallback_archive_ready INTEGER NOT NULL DEFAULT 0` to `session_finalizations`, with repeatable migration. Keep existing public finalization statuses. Use the existing `manifest_json` for the last valid submission ID/content-hash whitelist; missing-final manifests also identify their origin, last formal submission ID and wait start. Persist a new manifest and its eligibility atomically.

For a new accepted formal trial with `trial_index=N`, after durable file/manifest writes, sample aware UTC and save t0 in the same publication transaction as the submission. Only the first successful acceptance sets it. Rollback, invalid/conflicting requests and idempotent retries cannot create or reset it. N and tutorial requirements must belong to that session's schedule version; missing or mismatched configuration cannot qualify.

Historical rows start with NULL t0 and no fallback eligibility. Old `received_at` precedes durable writes and cannot be used to guess a save-completion time. Existing legacy eligibility and completed history remain intact; historical missing-t0 sessions require explicit maintenance recovery.

## Timing and candidate discovery

The constant deadline is t0 + 300 seconds, using parsed aware UTC. It is not experiment start + 300, first scan + 300, or latest request + 300. At 299 seconds do nothing; at 300 permit revalidation. Missing earlier trials or metadata prevent qualification but do not reset t0 when they arrive. Invalid timestamps fail closed; a clock earlier than t0 waits. Actual cloud completion may be later because of scans, queues and retryable failures.

Worker and maintenance retry discover unfinished v2 sessions with accepted final, a trustworthy t0 or a previously valid manifest, alongside existing normal/legacy candidates. There is no sleep or persistent lock during the five-minute wait. A per-session error is logged and isolated; it does not end unrelated sessions' work in that scan.

## Validation and execution boundaries

The publication lock protects consistent state and submission snapshots. Existing network session locks are keyed by `(experiment_id, participant_id, session_id)`. A candidate is not permission: recheck identity, configuration, time, metadata/tutorial/formal completeness and absence of final before first fallback qualification.

Archive execution consumes only the validated manifest's submission IDs and matching stored content hashes; it must not reselect every pending record from the session. New unvalidated final/trial records cannot join the old whitelist. A valid normal manifest supersedes its fallback subset. Previously valid normal whitelists retain their own retry permission if later extra records invalidate the current complete cache. Corrupt proofs or unavailable pending bytes are errors, not permission to expand the whitelist.

Local finalization uses only a short publication critical section, never the network-held session lock. A may upload slowly while A's late final or B's normal local completion is accepted and checked. Cloud copies remain serialized per session; other cloud work may queue on the existing single worker. Preserve lock order wherever both locks are needed: network session lock, then short publication lock. Do not recursively reacquire process locks.

## Late records, retries and cleanup

An accepted final triggers normal checking even without a later `/archive` call. Normal success stores a new validated whitelist and clears the fallback flag. Normal failure retains old valid proof and retries only its IDs. A rejected final changes none of the wait/proof state. A final arriving after original spool cleanup still uses archived status/URI for those original files' availability.

On a genuinely new accepted record, invalidate any complete cache for a different submission set and recompute session archive aggregate. Aggregate read/update and submission publication share the same short synchronization boundary; stale background calculations cannot overwrite a newly pending final with `archived`. Idempotent duplicates do not invalidate state.

Preserve each successful target; retry incomplete targets. Delete each submission's spool only after all its configured targets succeed. A crash after cloud write but before success recording may retry the same ID/path/bytes; this is not an exactly-once network guarantee. It must not create an extra submission/directory. Reuse the existing JSONL reconciliation and restart cleanup. No global data/assignment reset or fabricated production participant is permitted.

## Verification and delivery

Use existing unittest helpers, real temporary SQLite/spool and two local backends, an injectable patched UTC clock, controlled blocking/failing backends and existing process-spawn helpers. Exercise the 35 scenarios in the source note with focused tests and table-driven variants. Include a complete 24-trial byte-for-byte two-target workload, 299/300 boundaries, rollback, historical migration, late invalid final with a failed second cloud, whitelist races, same-session local finalization during blocked upload, cross-session isolation, HTTP 409/202 contracts and restart recovery.

Baseline observed on Windows before changes: 88 receiver tests ran; 87 passed and the built-package socket test errored in a clean worktree without dist, with WinError 10054. This is a fixture/environment limitation, not accepted evidence for new logic. Run relevant backend tests natively and full HTTP regression in Linux with the existing static artifact mounted when needed. Do not hide new failures behind this baseline.

Before deploying: independent scoped code review, complete receiver regression, migration against an isolated production DB copy, source/hash comparison, backups of code/config and consistent DB/spool, and unchanged assignment/content-digest checks. Deploy receiver only with the existing dependency image/configuration and persistent volume. Validate health, source hashes, unchanged config/sequence counters and isolated dual-cloud transfer. Preserve incoming production data on rollback; do not restore an old data snapshot over newer submissions.
