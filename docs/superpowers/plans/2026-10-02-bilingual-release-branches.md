# Bilingual Release Branches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create stable Chinese and English release branches from the current feature set and produce equivalent deployment packages that differ only in language.

**Architecture:** Keep the shared TypeScript runtime and persistent R12 assets identical. Add explicit English production/debug configuration alongside the existing Chinese configuration, route all participant-facing copy through locale-aware paths, then build and validate each branch independently. Branches are created in the existing checkout without a new worktree.

**Tech Stack:** TypeScript, Vite, Vitest, JSON experiment configurations, existing runtime/package validators, Git branches.

**Spec:** `docs/superpowers/specs/2026-10-02-bilingual-release-branches-design.md`

## Global Constraints

- Preserve the current 23 formal scenes and 25 presentations.
- Preserve the current 46-sequence schedule and 92 variable objects.
- Preserve the current tutorial package and its lock hashes.
- Preserve the current updated perspective assets and collision assets.
- Preserve DataPipe endpoint, experiment ID, result schemas, and upload behavior.
- Chinese uses `locale: "zh-CN"`; English uses `locale: "en-US"`.
- Do not create a new worktree or repository.
- Preserve all existing unrelated dirty user changes.

---

### Task 1: Capture Branch Baseline

**Files:**
- Read: `git status`, current branch history, existing `public/experiment/*.json`
- Test: `src/experiment-runner.test.ts`, `src/core/messages.test.ts`

- [ ] Record current branch, HEAD, dirty files, current package counts, and the exact commits already containing the feature set.
- [ ] Confirm `9a5b967` is an ancestor of the current HEAD.
- [ ] Confirm the current branch is the source for both release branches.
- [ ] Run focused tests before branching and record their result.
- [ ] Commit only the design documents if the working tree permits; never stage unrelated dirty files.

### Task 2: Create the Chinese Release Branch

**Files:**
- Branch: `release/zh-CN`
- Preserve: all existing source, assets, package files, and user dirty files

- [ ] Create `release/zh-CN` from the current HEAD without creating a worktree.
- [ ] Verify `public/experiment/experiment-zh.json` remains the production Chinese entry and uses the persistent package.
- [ ] Verify the root deployment entry points to the Chinese config.
- [ ] Run the Chinese focused runner, package, and schedule checks.
- [ ] Commit the branch marker/config-only changes only if needed, using `release: establish zh-CN package`.

### Task 3: Add English Production and Debug Configurations

**Files:**
- Create: `public/experiment/experiment-en.json`
- Create: `public/experiment/experiment-debug-en.json`
- Modify: `public/experiment/index.html` only if the branch entry requires an explicit English default
- Test: `src/experiment-runner.test.ts`, `src/schemas/experiment.schema.test.ts`

- [ ] Write failing tests asserting the English configs use `en-US`, the same persistent base URL, the same schedule version, 23 formal trials, and the same DataPipe experiment ID and endpoint.
- [ ] Run the focused tests and confirm they fail because the English config files do not exist.
- [ ] Copy the production/debug configuration structure from the current configs while changing only locale-specific values and language labels.
- [ ] Keep completion-code gate disabled for English unless the existing schema explicitly requires it; English behavior remains the established English path.
- [ ] Run focused tests and confirm both configs parse and preserve the shared package metadata.
- [ ] Perform a Grill-me check: compare every non-language field against the Chinese production config and remove accidental behavioral drift.
- [ ] Commit only the English configuration and tests with `feat: add en-US release configuration`.

### Task 4: Complete English Participant-Facing Copy

**Files:**
- Modify: `src/core/messages.ts`
- Modify: `src/experiment-runner.ts`
- Modify: any existing locale-specific UI module identified by the focused search
- Test: `src/core/messages.test.ts`, `src/experiment-runner.test.ts`, relevant component tests

- [ ] Write failing tests that assert English tutorial intro, reference-board controls, staged viewing guidance, task instructions, pause text, saving/error text, tutorial completion, reward summary, and final page remain English under `en-US`.
- [ ] Run focused tests and confirm the missing or inherited copy fails the assertions.
- [ ] Add the smallest locale-aware English strings using the existing message resolution path; do not duplicate runtime behavior.
- [ ] Verify Chinese strings remain unchanged under `zh-CN`.
- [ ] Run focused tests and confirm both locales pass.
- [ ] Perform a Grill-me check: search for Chinese characters in English participant-facing templates and English-only hard-coded strings in Chinese templates; fix only actual leaks.
- [ ] Commit only localization files and tests with `feat: complete bilingual participant copy`.

### Task 5: Build Both Branch Packages

**Files:**
- Modify: generated `dist/` outputs as build artifacts only
- Validate: `public/layout-task-run12-core23-persistent`, `public/experiment`, `public/layout-task-tutorial`

- [ ] Build the Chinese branch and record the bundle hashes.
- [ ] Validate its experiment package, runtime package, schedule, tutorial lock, 23 scenes, 92 variable objects, and 25 presentations.
- [ ] Build the English branch and record the bundle hashes.
- [ ] Validate the same package invariants for English.
- [ ] Perform a Grill-me check: compare package file inventories and hashes after excluding locale config, index entry, and expected localized bundle content; repair any unexpected drift.
- [ ] Commit generated release artifacts on each branch with language-specific release commit messages.

### Task 6: Browser Smoke Tests

**Files:**
- No source files unless a verified defect is found
- Validate: branch-specific `public/experiment` entry URLs

- [ ] Start Vite on an available port.
- [ ] Verify Chinese entry loads the Chinese consent/tutorial/reference-board flow and reaches the formal flow.
- [ ] Verify English entry loads the same flow with English copy.
- [ ] Verify both branches expose the same 23 formal scenes and preserve 25-presentation schedule metadata.
- [ ] Verify pause, save, recovery, DataPipe configuration, and developer mode behavior on both language entries.
- [ ] Perform a Grill-me check: ensure no smoke-test query parameter changes the production package behavior.

### Task 7: Final Verification and Branch Publication

**Files:**
- Read: all branch diffs and commit history

- [ ] Run `npm test -- --run`, `npm run build`, and `git diff --check` on the final source state.
- [ ] Verify `release/zh-CN` and `release/en-US` point to the intended commits and have no unintended files.
- [ ] Confirm the two branches share identical formal package contents, schedule, tutorial lock, and asset hashes.
- [ ] Run the final verification-before-completion checklist and report all remaining limitations.
- [ ] Push both branches only after validation succeeds; do not merge either branch into `main`.
