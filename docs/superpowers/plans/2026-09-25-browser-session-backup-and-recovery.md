# Browser Session Backup and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every task follows RED -> GREEN -> self-check -> focused verification.

**Goal:** Add a browser-local IndexedDB backup for each trial and final result set, retain it until remote success, and build recovery ZIPs from the complete local session.

**Architecture:** A session-scoped `LocalBackupStore` is created by `createRunnableExperiment` and passed through the timeline into each `LayoutTaskPlayer` and `DataSaveService`. The final runner writes generated files into the same store; recovery reads the store, and successful remote save clears only that namespace.

**Tech Stack:** TypeScript, IndexedDB, Vitest, existing ZIP helper, Vite.

**Spec:** `docs/superpowers/specs/2026-09-25-browser-session-backup-and-recovery-design.md`

## Global Constraints

- Do not modify furniture coordinates, rotations, collision geometry, confidence rules, or trial scheduling.
- Preserve copy mode as fully offline; it must not call `fetch`.
- Preserve the existing receiver/DataPipe payload schemas and endpoints.
- The local backup is scoped to one experiment/participant/session and must not clear other sessions.
- Preserve all unrelated dirty user changes and `public/layout-task-run12-core23-compiled/assets/collision/`.

## Review Focus

- IndexedDB unavailable or quota failure: remote upload must not be falsely reported as safely backed up.
- Duplicate retry of one filename: the local store must replace the record, not create duplicate ZIP entries.
- Remote failure after local success: all previous trial files and final files remain recoverable.
- Copy mode: local backup may be written but no network request is allowed.
- Cleanup scope: successful completion must clear only the current session namespace.

### Task 1: Local backup store

**Files:**
- Create: `src/core/local-backup-store.ts`
- Test: `src/core/local-backup-store.test.ts`

- [ ] Write tests for in-memory save/list replacement and clear isolation.
- [ ] Run the focused test and observe failure because the store module does not exist.
- [ ] Implement the `LocalBackupStore` interface, in-memory test adapter, and IndexedDB browser adapter with filename-keyed writes.
- [ ] Run the focused tests and verify they pass.
- [ ] Self-check: confirm data is namespaced and no `localStorage` payload storage is introduced.

### Task 2: Per-trial local persistence

**Files:**
- Modify: `src/core/data-save-service.ts`
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/plugins/jspsych-layout-task.ts`
- Modify: `src/experiment-runner.ts`
- Test: `src/core/data-save-service.test.ts`
- Test: `src/plugins/jspsych-layout-task.test.ts`

- [ ] Add a failing test proving the exact trial payload is saved locally before `fetch`.
- [ ] Run it and observe failure because no local store is wired.
- [ ] Add the optional store dependency and pass it through timeline/plugin/player into `DataSaveService`; save the trial envelope before network upload.
- [ ] Keep copy mode offline while still writing its local backup.
- [ ] Run focused tests and verify pass.
- [ ] Self-check: no duplicate upload, no changes to receiver/DataPipe request bodies, no coordinate/interaction changes.

### Task 3: Final files and complete recovery source

**Files:**
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/zip-recovery.ts` only if the existing helper needs a typed file adapter.
- Test: `src/experiment-runner.test.ts`
- Test: `src/core/zip-recovery.test.ts` if needed.

- [ ] Add failing tests proving final files are written locally and recovery output includes earlier trial files plus all final files after failure.
- [ ] Run focused tests and observe failure.
- [ ] Persist final files before final upload; make recovery ZIP read the complete local set with in-memory fallback.
- [ ] Keep existing recovery text output and add the ZIP Blob to the existing result path without changing success UI semantics.
- [ ] Run focused tests and verify pass.
- [ ] Self-check: tutorial rows/files remain included; formal count and CSV schemas are unchanged.

### Task 4: Cleanup only after remote success

**Files:**
- Modify: `src/experiment-runner.ts`
- Test: `src/experiment-runner.test.ts`

- [ ] Add failing tests for clearing after receiver/DataPipe success, retaining after failure, and retaining in copy mode.
- [ ] Run tests and observe failure.
- [ ] Clear only the current store namespace after a confirmed successful remote save; leave it intact otherwise.
- [ ] Run focused tests and verify pass.
- [ ] Self-check: cleanup never calls `clear` before the final response/archive succeeds.

### Task 5: Full verification and runtime check

**Files:**
- No new product files unless a focused test exposes a defect.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` on touched files.
- [ ] Start Vite and verify the debug experiment URL loads.
- [ ] Verify the browser-local IndexedDB store is used by the production runner path and no unrelated dirty files were changed.
