# Missing-final fallback verification

Date: 2026-11-13. Branch: `codex/vps-missing-final-fallback`.

Specification: `docs/superpowers/specs/2026-11-13-missing-final-fallback-design.md`.
Implementation plan: `docs/superpowers/plans/2026-11-13-missing-final-fallback.md`.
Source design/audit: `docs/notes/2026-11-13-vps-missing-final-fallback-design.md`.

## Scope and implementation

Production code changes are confined to `receiver/app/storage.py`. Existing
server, worker and maintenance entry points use the shared implementation without
new dependencies. Frontend, static repositories, URLs, experiment configuration,
stimuli, scoring and sequence allocation have no changes in this branch.

The first durable acceptance of formal trial N records t0 in its SQLite
transaction. The worker rechecks at t0 + 300 seconds and persists the exact
submission-ID/content-hash whitelist for missing-final backup. No final is
invented: `data_complete` remains false and HTTP `/archive` remains 409.
Valid late finals supersede that set. Invalid late records or exceptions do not
erase previously valid backup permission. Local finalization and aggregate
publication use short publication locks, independent of slow cloud uploads.

The original dirty checkout was left intact. Implementation is isolated in
`C:/Users/tianf/.codex/worktrees/missing-final-fallback/LayoutTask_Player`.

## Red/green evidence and review

- Five persistence tests initially failed before schema/t0 implementation; those
  five plus existing storage tests passed (45 tests, 17.189 seconds).
- The second batch exposed ten missing eligibility/whitelist/cache behaviors
  before their implementation. The first 19 feature tests then passed on Windows
  (6.726 seconds) and WSL Linux (5.259 seconds).
- Independent read-only review found two important defects: requirements could
  come from a different schedule, and a new-final validation exception could
  interrupt a valid old whitelist. Three regression tests reproduced those
  failures. Both fixes passed the expanded suite; scoped re-review reported no
  Critical or Important findings.
- One existing test's old assertion was deliberately corrected: a genuinely new
  record must invalidate the current complete cache while retaining old proof.
  The test now verifies exactly that; it does not weaken identity/data checks.

Final verification against implementation commit `5d4c95b`:

| Environment | Command / result |
| --- | --- |
| Native Windows, Pixi Python | `python -m unittest test_missing_final test_storage -q`: 74 passed, 39.075 seconds |
| WSL Python 3.12.3 | `PYTHONPATH=.:tests python3 -m unittest discover -s tests -q`: 122 run, 121 passed, 1 skipped, 43.812 seconds |
| VPS, existing production dependency image | Same full discover: 122 run, 121 passed, 1 skipped, 168.615 seconds |

The Linux skip is the existing Windows-only file-replacement test, which ran in
the native Windows storage suite. Linux full runs include real socket HTTP and
the built-package test using the existing `dist/experiment/index.html` fixture;
no static source was changed or published. Deliberate malformed-data/outage tests
emit `archive_session_error`; their assertions verify isolation and failure state.

## Acceptance mapping

All feature tests below are in `receiver/tests/test_missing_final.py` unless
otherwise noted. Names omit the `test_` prefix. Rows follow the 35 scenarios in
the reviewed design note. Some scenarios share one controlled workload.

| # | Scenario | Executed evidence |
| --- | --- | --- |
| 1 | Normal 24 + final + archive | `test_data_pipe`: `complete_24_trial_workload_keeps_every_original_byte_in_both_archives`; HTTP normal path |
| 2 | Long experiment without last trial | `wait_origin_is_last_formal_after_durable_files_not_experiment_start`; incomplete variants |
| 3 | 299 seconds, not yet eligible | `24_formal_trials_qualify_at_300_not_299_and_preserve_both_cloud_bytes` |
| 4 | 300 seconds, backup without final | Same 24-trial workload, both exact directory byte comparisons |
| 5 | Disk/transaction/rejection before last acceptance | `failed_last_trial_transaction_cannot_publish_wait_origin`; `failed_final_disk_sync_and_jsonl_repair_keep_correct_wait_origin` |
| 6 | Scan/retry/other people do not reset t0 | `wait_origin_survives_idempotent_last_trial_retry_and_restart`; isolation workload |
| 7 | Last arrives first, earlier records arrive late | `late_earlier_trials_and_metadata_use_original_last_trial_origin` |
| 8 | Missing/repeated/conflicting identities or bytes | `incomplete_sessions_never_qualify_even_after_deadline`; `duplicate_index_does_not_reset_origin_or_qualify`; missing-byte/presentation variants; existing cross-kind assignment tests |
| 9 | Restart/idempotency do not consume another slot | `wait_origin_survives_idempotent_last_trial_retry_and_restart`; existing assignment/idempotency tests |
| 10 | Historical migration does not guess t0 | `historical_rows_and_identical_retry_do_not_guess_missing_origin`; repeated production-copy migration |
| 11 | Version/count/tutorial/time failures | `wrong_schedule_cannot_start_wait_using_current_count`; two requirement regressions; malformed/naive/future clock and missing-count variants |
| 12 | Crash before/after eligibility commit | `process_exit_around_proof_commit_and_cloud_write_recovers_same_ids_paths_bytes` (exit 41/42) |
| 13 | Final during wait | `accepted_final_without_archive_request_takes_normal_path_without_wait` |
| 14 | Final accepted but no archive request | Same final-without-request workload |
| 15 | Final during recheck/upload/after cleanup | `final_arriving_during_upload_is_not_added_to_validated_whitelist`; `final_after_original_spool_cleanup_updates_aggregate_then_normal_completion` |
| 16 | Same-session blocked cloud, final local ACK | `same_session_final_acknowledgement_does_not_wait_for_blocked_cloud_upload` (HTTP 202 while cloud remains blocked) |
| 17 | First cloud success, second fails, invalid final | `late_invalid_final_preserves_original_proof_and_second_cloud_retry`; validation-exception regression |
| 18 | Rejected final preserves t0/proof | `rejected_final_does_not_change_wait_or_proof`; existing identity/conflict tests |
| 19 | Invalid final before qualification | `invalid_final_before_any_qualification_cannot_create_fallback` |
| 20 | New final/extra trial excluded from old set | Upload-arrival test; `new_record_invalidates_complete_cache_but_preserves_old_valid_backup` |
| 21 | Archived raw data, new final pending | `final_after_original_spool_cleanup_updates_aggregate_then_normal_completion` |
| 22 | Old aggregate cannot overwrite new final | `aggregate_read_write_cannot_overwrite_a_new_finals_pending_state` (controlled barrier) |
| 23 | New set invalidates cache; identical retry does not | Cache/old-backup test; existing `finalization_proof_survives_restart_but_new_record_invalidates_complete_cache`; duplicate/restart test |
| 24 | Old normal proof retries when new set invalid | `new_record_invalidates_complete_cache_but_preserves_old_valid_backup` |
| 25 | Missing-final HTTP remains 409, proof retained | `archive_http_contract_remains_409_after_fallback_and_202_for_late_valid_final` |
| 26 | Single cloud failure and restart | Late-invalid-final retry; `test_data_pipe` worker restart/target-success tests |
| 27 | Crash after cloud write, before DB record | Process-exit workload phase `cloud-before-db`, exit 43; exact original IDs, paths and bytes |
| 28 | Two processes handle one fallback | `two_processes_serialize_the_same_fallback_without_reuploading` |
| 29 | Session A exception does not abort B | `one_session_check_error_does_not_end_another_sessions_scan`; corrupt-proof test |
| 30 | Waiting A, complete B, incomplete C | `a_waiting_b_complete_c_incomplete_and_shared_identity_parts_stay_isolated` |
| 31 | Two people's half sessions never combine | `two_half_sessions_do_not_combine_and_experiment_is_part_of_identity` (12 + 12 of 24) |
| 32 | Shared session/participant/sequence parts | Both identity workloads verify participant, session and experiment boundaries |
| 33 | Developer uses same rules, no real slot | `developer_uses_identical_checks_without_allocating_a_slot` |
| 34 | Blocked A upload does not block B local completion | `blocked_a_cloud_does_not_delay_b_local_normal_completion` |
| 35 | Worker and maintenance enforce same rule | `worker_and_maintenance_command_use_same_deadline_and_whitelist` (299 and 300 seconds through each entry) |

## Production migration preflight

All ten live receiver modules matched the branch base after line-ending
normalization. No production-only source fix was found. Source/container image
before update: `sha256:1686f9817ce06b41221a734620cac90af1b67b52de2f9e8be6edf46c4d105f9e`.
The candidate image reuses that dependency image and replaces only storage.py.

A consistent SQLite backup was migrated twice in an isolated container. Every
preexisting column and row in these tables compared equal:

| Table | Rows | SHA-256 of canonical original rows |
| --- | --- | --- |
| assignments | 7 | `3c1b2462b06a451a80ac2878252726168178e4cb21017881ad85c0db42cff55e` |
| submissions | 346 | `1b5e04c4d09e7a78971f2a69dc8b3ced1503c7c9d27c8d467e68db4dfc67b977` |
| submission_files | 412 | `31774b637431b38e5929ad7a39be73541c0931d4dedff80320809c9a0dfe3001` |
| archive_targets | 612 | `f4b54d8cc6c3b4066f1fa45aac322a647d0eab069048f8b3f64841b481f76f10` |
| session_finalizations | 92 | `2698f8263245c62902b0285903f92cc2906aeccf9232543886efd7961553ca9a` |

All 92 historical wait origins remained NULL with fallback flag zero. The
production experiment remains Run 41, N=24, tutorial required, 46 sequence IDs,
30-second scan, Jianguoyun plus Sciebo. Migration did not allocate a slot.

## Deployment and real-cloud verification

Deployed on 2026-11-13 to the established receiver at
`/srv/agent/layouttask-receiver`, host `vmi3468425`. The existing dependency image
was reused; only `/app/app/storage.py` was replaced. The other nine running
module hashes equal their predeployment hashes.

- Running image: `sha256:0275d0f942788a76376e13ab84e376d119da3dd106167969b3a11b6e79682b7f`.
- Running storage.py SHA-256: `076e3681ba76f9ce3ca778b086559cf0a1fd51a038111224433c07af1ade1479`, matching the reviewed local candidate.
- Backup: `/srv/agent/layouttask-receiver/backups/missing-final-20261113/`;
  contains source/config/rclone snapshot, stopped-data tar, original SQLite,
  previous-image ID, and before/after source hashes. The old image remains tagged
  `layouttask-receiver:before-missing-final-20261113`.
- Container is running; internal health and public
  `https://datapipe.eastnoob.top/health` return success (`{"ok": true}`).
- `.env` hash stays `3491c8a98d0117f69fb649deb3aa4e8491c7fd638bed3105a289c8609465a48d`;
  `compose.yaml` stays `4ffcf1ea8cfb8fcfff43c25250da48a2869ede0854d82906bd932dfbd94b0dcf`.
- After rollout, all 7 assignment records, 346 submission identities/digests,
  412 file records and 612 archive-target records were preserved. Existing
  successes were not downgraded. All six remaining spool files compared byte
  for byte with the stopped-data backup.
- Sequence count remains 46; max participant number remains 7. Historical t0
  and fallback flags remain unset. Existing session aggregate counts are
  unchanged (5 complete/archived, 1 collecting/archived, 86 collecting/pending).
  Three pending metadata submissions remain incomplete; they were not granted
  backup permission by this deployment.

A dedicated temporary store, outside production data/assignment allocation,
ran real Jianguoyun and Sciebo uploads using the existing VPS rclone credentials.
It verified no transfer at 299 seconds, fallback at 300 seconds with
`data_complete=false`, then a valid late final and normal takeover. Six original
submissions (13 files including original manifests) were independently downloaded
from each cloud and compared byte for byte. Both readback digest maps hash to
`17d268bf1636aabb2dabae1c45181e27d1a13db42ec573aa09075630f3323c64`.
The dedicated cloud path
`experimentalDataPipeline/layouttask-receiver/verification/missing-final-20261113`
was removed from each cloud after successful verification; no participant data
was removed and no production slot was consumed.

Rollback must restore the saved source/image while retaining the current data
volume. Do not extract `data.tar` over incoming submissions. Old code does not
process missing-final eligibility, so a rollback can pause those backups.

## Limits

No physical power-loss or large participant load test. Crash tests terminate
real isolated processes, not the host. A cloud write can repeat after a crash
before its DB receipt; it reuses the same submission path and original bytes.
The existing single worker may queue cloud work. The 300-second threshold is
eligibility time, not a promise that both clouds finish at exactly five minutes.
Missing-final fallback preserves only received originals; it cannot reconstruct
client-only final fields. Historical missing-t0 sessions need explicit recovery.
