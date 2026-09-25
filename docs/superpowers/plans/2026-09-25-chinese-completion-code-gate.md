# Chinese Completion-Code Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit Chinese compilation mode with a required opaque completion-code page that waits 15 seconds before allowing the code to be saved and uploaded.

**Architecture:** Extend the experiment config with `locale` and `completion_code_gate`. Add a runner-owned gate before final data construction so the entered value reaches every existing output and transport path. Keep non-Chinese builds on their current save flow.

**Tech Stack:** TypeScript, jsPsych 8, Vitest, DOM UI, Zod schemas, CSV/JSON/DataPipe/IndexedDB/recovery ZIP pipeline.

**Spec:** `docs/superpowers/specs/2026-09-25-chinese-completion-code-gate-design.md`

## Development Branch and Integration

- Start from a clean `main`.
- Do not create a worktree.
- Create and use `codex/chinese-completion-code-gate`.
- Use one focused commit per task.
- Verify the branch completely before integration.
- Merge with `git merge --ff-only codex/chinese-completion-code-gate` only after explicit approval.
- Do not push `main` unless separately requested.

## Global Constraints

- Activate the feature only through explicit configuration, never by experiment ID.
- The first supported locale is exactly `zh-CN`; non-Chinese builds remain unchanged.
- Enable the gate only when `locale === "zh-CN"` and `completion_code_gate.enabled === true`.
- The minimum display time is exactly 15,000 milliseconds.
- Eligibility uses `trim().length`, but the stored value is the exact untrimmed input.
- The Player must not generate, interpret, normalize, or format the completion code.
- `202609259125` is ordinary questionnaire copy, not a value to validate.
- Upload and archive must not begin before Continue.
- Do not add a runtime dependency.

## Review Focus

- Chinese mode inserts the gate before data construction/upload; English mode bypasses it.
- Only `填写完成码并截图保存本页` is red and bold; the fixed number remains ordinary.
- Continue stays disabled before 15 seconds, while empty, and after clearing a valid value.
- The exact untrimmed code reaches every output with unchanged identifiers.
- Upload failure retains the code in recovery output and does not remount the gate.

---

### Task 1: Create and verify the development branch

**Files:** No product files.

- [ ] **Step 1: Verify the starting state.** Run `git status --short`, `git branch --show-current`, and `git log -1 --oneline`. Expected: clean `main`; preserve unrelated changes instead of resetting them.
- [ ] **Step 2: Create the branch without a worktree.** Run `git switch -c codex/chinese-completion-code-gate`. If it exists, inspect its tip and switch without resetting it.
- [ ] **Step 3: Verify the baseline.** Run `git status --short` and `git log --oneline --decorate -3`; expected: a clean feature branch based on the intended `main`.

### Task 2: Extend locale and gate configuration

**Files:** Modify `src/types/config.ts`, `src/schemas/config.schema.ts`, and `src/core/config-loader.ts` only if existing normalization requires it. Test `src/schemas/config.schema.test.ts` and `src/core/config-loader.test.ts`.

**Produces:** Validated `locale?: "en-US" | "zh-CN"` and `completion_code_gate?: { enabled: boolean; min_display_ms?: number }`.

- [ ] **Step 1: Write failing tests.** Cover `zh-CN` with `enabled: true` and `min_display_ms: 15000`, reject unsupported locales and non-positive durations, and preserve current behavior when the gate is omitted.
- [ ] **Step 2: Run `npm test -- --run src/schemas/config.schema.test.ts src/core/config-loader.test.ts`; verify the new assertions fail.**
- [ ] **Step 3: Implement the narrow locale union, positive duration bound, and defaults.** Do not infer locale from URLs or task IDs.
- [ ] **Step 4: Run the focused tests and verify they pass.**
- [ ] **Step 5: Commit:** `git add src/types/config.ts src/schemas/config.schema.ts src/core/config-loader.ts src/schemas/config.schema.test.ts src/core/config-loader.test.ts; git commit -m "feat: add locale completion gate config"`.

### Task 3: Build the completion-code gate page

**Files:** Create `src/core/completion-code-gate.ts` and `src/core/completion-code-gate.test.ts`; modify `src/styles/layout-task.css`.

**Produces:** `CompletionCodeGate` with `mount(root)`, `isComplete()`, `getValue()`, and `destroy()`, using an injectable clock.

- [ ] **Step 1: Write failing tests.** At 0 ms and at 15,000 ms with empty input, Continue is disabled; at 15,000 ms with `"  CODE-17  "`, it enables and `getValue()` returns the exact untrimmed value; clearing the field disables it again.
- [ ] **Step 2: Run `npm test -- --run src/core/completion-code-gate.test.ts`; verify failure because the module does not exist.**
- [ ] **Step 3: Implement semantic DOM.** Render the exact sentence `请在下方填写完成码并截图保存本页。以便发布者审核数据与发放报酬(202609259125)。`, an accessible required text input, a visible countdown, and disabled `Continue`. Use `trim().length` only for eligibility.
- [ ] **Step 4: Style only `填写完成码并截图保存本页` red and bold.** Keep surrounding text and `(202609259125)` ordinary and match existing tutorial/final-page styles.
- [ ] **Step 5: Run `npm test -- --run src/core/completion-code-gate.test.ts` and `npm run build`; expected PASS.**
- [ ] **Step 6: Commit:** `git add src/core/completion-code-gate.ts src/core/completion-code-gate.test.ts src/styles/layout-task.css; git commit -m "feat: add Chinese completion code gate"`.

### Task 4: Insert the gate before final save

**Files:** Modify `src/experiment-runner.ts` and `src/experiment-runner.test.ts`; modify `src/main.ts` only if bootstrap forwarding is required.

**Produces:** Final file construction and save cannot run until the Chinese gate returns a non-empty value.

- [ ] **Step 1: Write failing runner tests.** Assert that enabled `zh-CN` inserts the gate after the final formal trial and before saving, English/disabled modes omit it, the exact untrimmed input reaches the save callback, and the gate is not counted as a formal trial.
- [ ] **Step 2: Run `npm test -- --run src/experiment-runner.test.ts`; verify failure.**
- [ ] **Step 3: Implement one `completionCode` run-context value.** Await the gate only for enabled `zh-CN`; keep the existing path for other modes. Do not render the saving page or start upload before completion.
- [ ] **Step 4: Add mocked-fetch assertions that no `/submit` or `/archive` request occurs before Continue and upload failure does not remount the gate.**
- [ ] **Step 5: Run the focused tests and `npm run build`; commit the runner changes with `feat: gate final save on Chinese completion code`.

### Task 5: Thread the code through all outputs

**Files:** Modify `src/core/experiment-data.ts`, `src/core/data-save-service.ts`, `src/core/local-backup-store.ts`, `src/core/zip-recovery.ts`, `src/types/result.ts`, and `src/schemas/result.schema.ts`. Test the corresponding existing test files; preserve existing helper behavior when no new sidecar field is required.

**Produces:** `completion_code` in session CSV, formal result output, raw JSON, IndexedDB backup, recovery ZIP, and DataPipe envelope, joined by existing participant/session/experiment identifiers.

- [ ] **Step 1: Write failing tests with `completionCode: "  CODE-17  "`.** Assert the exact string appears in every output; assert English mode does not fabricate a value.
- [ ] **Step 2: Run focused data/save/backup/ZIP tests; verify failure.**
- [ ] **Step 3: Add `completion_code` at the session metadata boundary and update schemas.** Append CSV fields where possible; never use the value in filenames, paths, SQL, or archive keys.
- [ ] **Step 4: Pass the value through all output builders and `createReceiverSubmission`.**
- [ ] **Step 5: Run focused tests and `npm test -- --run`; expected all tests pass.**
- [ ] **Step 6: Commit:** `git commit -m "feat: persist completion code in experiment outputs"` after staging only the output/schema files and tests.

### Task 6: Add Chinese participant copy

**Files:** Modify `src/core/messages.ts`, `src/experiment-runner.ts`, and `src/core/tutorial-controller.ts`; test/create `src/core/messages.test.ts`, `src/experiment-runner.test.ts`, and `src/core/tutorial-controller.test.ts`.

- [ ] **Step 1: Write failing locale tests.** Assert Chinese intro/tutorial completion/saving/failure/final copy and exact completion-code copy; assert English strings remain unchanged.
- [ ] **Step 2: Run the focused tests and verify failure.**
- [ ] **Step 3: Implement a narrow locale resolver.** Translate participant-facing copy only; keep schema names, task IDs, QIDs, and diagnostics unchanged.
- [ ] **Step 4: Run the focused tests and commit with `feat: add Chinese participant copy`.**

### Task 7: Verify branch and integrate

**Files:** Modify only for focused regression fixes.

- [ ] **Step 1: Run `npm test -- --run`, `npm run build`, `git diff --check`, and `git status --short`.** Expected: all pass, build succeeds, no whitespace errors, clean worktree.
- [ ] **Step 2: Browser smoke test the actual experiment entry.** Confirm Chinese mode reaches the gate only after the final trial; only the requested phrase is red/bold; Continue waits 15 seconds and requires non-empty input; the exact untrimmed code reaches the payload; English bypasses the gate; upload failure retains recovery data without remounting.
- [ ] **Step 3: Review history with `git log --oneline --decorate main..codex/chinese-completion-code-gate`, `git diff --stat main...codex/chinese-completion-code-gate`, and `git status --short`.** Confirm no unrelated assets/generated packages changed.
- [ ] **Step 4: After explicit approval, run `git switch main` and `git merge --ff-only codex/chinese-completion-code-gate`.** Do not push remote `main` unless separately requested.
- [ ] **Step 5: Report branch, commit range, tests, build, browser smoke results, exact field location, and any receiver/network limitation.**
