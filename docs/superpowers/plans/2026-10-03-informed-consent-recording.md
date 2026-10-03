# Informed Consent Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Add a bilingual, four-confirmation informed-consent gate before participant setup and preserve its signed confirmation metadata through all existing exports and uploads.

**Architecture:** `waitForExperimentConsent()` will return a serializable `ConsentRecord` instead of a string. `main.ts` will keep the record until experiment construction, and `createRunnableExperiment()` will pass it into the existing CSV/JSON generation layer. The consent page will remain a small DOM flow in `src/core/experiment-consent.ts`; no new upload path or raw-data-cleaning path will be introduced.

**Tech Stack:** TypeScript, Vitest, Vite, jsPsych, existing IndexedDB recovery and DataPipe exporters.

**Spec:** `docs/superpowers/specs/2026-10-03-informed-consent-recording-design.md`

## Global Constraints

- Work in the current checkout; do not create a worktree or use destructive Git commands.
- Preserve all existing dirty user files and the existing task/tutorial/formal assets.
- Do not modify the separate raw-data cleaning/deletion implementation or rewrite its existing policy wording.
- Consent occurs before participant number generation, sequence assignment, Prolific ID collection, and DataPipe requests.
- Keep English and Chinese semantically equivalent and keep developer mode available in both locales.
- Preserve the existing DataPipe, IndexedDB, recovery ZIP, reward, pause, scoring, and trial behavior.

---

### Task 1: Define the consent record and result contract

**Files:**
- Modify: `src/core/experiment-consent.ts`
- Test: `src/core/experiment-consent.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produce `ConsentRecord` with the exact fields in the spec.
- Change `ExperimentConsentResult` to return `{ mode: "agreed" | "developer"; consent: ConsentRecord }`.

- [ ] **Step 1: Write the failing test**

Add tests asserting that a successful consent result contains all four true confirmation fields, `signature_method: "checkbox_confirmation"`, locale, timestamp, and developer marker.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/core/experiment-consent.test.ts`

Expected: FAIL because the current consent function returns only the string `"agreed"`/`"developer"` and has no consent record.

- [ ] **Step 3: Write minimal implementation**

Add the typed record and return object while preserving the existing Konami route and existing caller behavior semantics.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/core/experiment-consent.test.ts`

Expected: PASS.

- [ ] **Step 5: Grill-me check**

Confirm no consent result can be constructed with a false checkbox and no pre-consent side effect was added.

- [ ] **Step 6: Commit**

Run: `git add src/core/experiment-consent.ts src/core/experiment-consent.test.ts src/main.ts && git commit -m "feat: define informed consent record"`

### Task 2: Build the bilingual four-checkbox consent page

**Files:**
- Modify: `src/core/experiment-consent.ts`
- Test: `src/core/experiment-consent.test.ts`
- Modify: `src/styles/layout-task.css`

**Interfaces:**
- Consume `ConsentRecord` from Task 1.
- Produce a consent UI with four required checkbox IDs, an explicit electronic-signature notice, and a disabled-until-complete consent button.

- [ ] **Step 1: Write the failing test**

Add DOM tests that render English and Chinese consent pages, assert the four checkbox labels and electronic-confirmation text, verify the button starts disabled, remains disabled after three checks, and becomes enabled only after all four checks.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/core/experiment-consent.test.ts`

Expected: FAIL because the current page has no checkboxes and its button is enabled immediately.

- [ ] **Step 3: Write minimal implementation**

Render the bilingual fieldsets and bind one update handler that sets `button.disabled = !allChecked`. Keep the existing Konami listener active on the consent page.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/core/experiment-consent.test.ts`

Expected: PASS.

- [ ] **Step 5: Grill-me check**

Verify the copy does not claim anonymity, does not use the PDF's €7/20–30-minute values, and does not alter the raw-data deletion wording.

- [ ] **Step 6: Commit**

Run: `git add src/core/experiment-consent.ts src/core/experiment-consent.test.ts src/styles/layout-task.css && git commit -m "feat: add bilingual informed consent gate"`

### Task 3: Keep consent before all participant setup

**Files:**
- Modify: `src/main.ts`
- Test: `src/main.test.ts` or `src/core/experiment-consent.test.ts`

**Interfaces:**
- Consume the Task 1 result object.
- Produce runner inputs containing the consent record without changing the existing developer/formal setup split.

- [ ] **Step 1: Write the failing test**

Add a source/flow test proving the consent result is passed into the runnable experiment and that assignment request code is reached only after consent resolves.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/main.test.ts src/core/experiment-consent.test.ts`

Expected: FAIL because `main.ts` currently compares the result directly to the string `"developer"` and does not pass consent onward.

- [ ] **Step 3: Write minimal implementation**

Store `const consentResult = await waitForExperimentConsent(...)`, derive `developerDebug` from `consentResult.mode`, and pass `consentResult.consent` into `createRunnableExperiment()`.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/main.test.ts src/core/experiment-consent.test.ts`

Expected: PASS.

- [ ] **Step 5: Grill-me check**

Confirm no participant ID, assignment request, or DataPipe call can occur before the awaited consent promise resolves.

- [ ] **Step 6: Commit**

Run: `git add src/main.ts src/main.test.ts src/core/experiment-consent.test.ts && git commit -m "feat: gate participant setup on consent"`

### Task 4: Carry consent through the runner and session metadata

**Files:**
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/experiment-session.ts`
- Modify: `src/core/local-backup.ts` or the existing local-backup type module
- Tests: `src/experiment-runner.test.ts`, `src/core/experiment-session.test.ts`

**Interfaces:**
- Consume `ConsentRecord`.
- Produce local session metadata and export input containing the same record.

- [ ] **Step 1: Write the failing test**

Add tests asserting the runner forwards consent into session metadata and `createExperimentCsvFiles()` input, including developer mode.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/experiment-runner.test.ts src/core/experiment-session.test.ts`

Expected: FAIL because the runner has no consent option and local metadata has no consent field.

- [ ] **Step 3: Write minimal implementation**

Add an optional `consent` option to `createRunnableExperiment()`, save it in the existing session metadata object, and pass it to export generation and save calls without changing local-backup mechanics.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/experiment-runner.test.ts src/core/experiment-session.test.ts`

Expected: PASS.

- [ ] **Step 5: Grill-me check**

Verify the implementation adds metadata only; it does not create a second upload, alter pause/reward timing, or touch raw-data cleanup.

- [ ] **Step 6: Commit**

Run: `git add src/experiment-runner.ts src/core/experiment-session.ts src/core/local-backup.ts src/experiment-runner.test.ts src/core/experiment-session.test.ts && git commit -m "feat: carry consent through session state"`

### Task 5: Export consent to CSV, JSON, recovery ZIP, and DataPipe

**Files:**
- Modify: `src/core/experiment-data.ts`
- Modify: `src/core/zip-recovery.ts` if the existing manifest needs an explicit consent summary
- Tests: `src/core/experiment-data.test.ts`, `src/core/zip-recovery.test.ts`, `src/core/data-save-service.test.ts`

**Interfaces:**
- Consume `ConsentRecord` on `ExperimentCsvInput`.
- Produce session CSV consent columns, debug/tutorial JSON consent object, and unchanged generated file payloads for DataPipe/recovery ZIP.

- [ ] **Step 1: Write the failing test**

Add assertions that generated session CSV contains the four confirmation columns, locale, consent timestamp, notice versions, and signature method; debug/tutorial JSON contains the same record; generated DataPipe payloads contain those file contents.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/core/experiment-data.test.ts src/core/zip-recovery.test.ts src/core/data-save-service.test.ts`

Expected: FAIL because consent is not part of `ExperimentCsvInput` or generated exports.

- [ ] **Step 3: Write minimal implementation**

Add the record to the existing input and emit it in session CSV and JSON metadata. Keep current CSV headers and values intact apart from additive consent columns. Let recovery ZIP and DataPipe reuse those files.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/core/experiment-data.test.ts src/core/zip-recovery.test.ts src/core/data-save-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Grill-me check**

Confirm no original cleaning fields were renamed/removed, no second DataPipe request exists, and failed upload still leaves the complete recovery ZIP.

- [ ] **Step 6: Commit**

Run: `git add src/core/experiment-data.ts src/core/zip-recovery.ts src/core/experiment-data.test.ts src/core/zip-recovery.test.ts src/core/data-save-service.test.ts && git commit -m "feat: export informed consent metadata"`

### Task 6: Bilingual configuration and browser-facing copy validation

**Files:**
- Modify: `public/experiment/experiment.json` only if notice version/config metadata is needed
- Modify: `public/experiment/experiment-zh.json` only if notice version/config metadata is needed
- Tests: `src/core/config-loader.test.ts`, `src/core/experiment-consent.test.ts`

**Interfaces:**
- Consume the fixed `en-US`/`zh-CN` locale from each config.
- Produce identical consent schema and current £4 / 20–40 minute copy in both languages.

- [ ] **Step 1: Write the failing test**

Add configuration/copy assertions for both locales and the consent/notice version values.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/core/config-loader.test.ts src/core/experiment-consent.test.ts`

Expected: FAIL if either package lacks the explicit consent metadata or current copy contract.

- [ ] **Step 3: Write minimal implementation**

Add only the required stable version/config values; do not copy PDF amounts or change unrelated reward configuration.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/core/config-loader.test.ts src/core/experiment-consent.test.ts`

Expected: PASS.

- [ ] **Step 5: Grill-me check**

Verify English and Chinese fields are semantically aligned, developer mode is available in both, and the displayed duration is exactly “approximately 20–40 minutes” / its Chinese equivalent.

- [ ] **Step 6: Commit**

Run: `git add public/experiment/experiment.json public/experiment/experiment-zh.json src/core/config-loader.test.ts src/core/experiment-consent.test.ts && git commit -m "test: validate bilingual consent configuration"`

### Task 7: Full verification and package validation

**Files:**
- No production files unless verification finds a test-proven defect.

- [ ] **Step 1: Write/extend failing smoke assertions**

Add any missing browser-facing test for the disabled button, four checks, and consent payload visibility before running the full suite.

- [ ] **Step 2: Run focused smoke tests**

Run: `npm test -- --run src/core/experiment-consent.test.ts src/core/experiment-data.test.ts src/experiment-runner.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run: `npm test -- --run`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript and Vite build exit 0.

Run: `git diff --check`

Expected: no output and exit 0.

- [ ] **Step 4: Grill-me check**

Review the diff for accidental asset changes, raw-data cleanup wording changes, pre-consent requests, duplicate uploads, or missing bilingual fields.

- [ ] **Step 5: Browser smoke test**

Start Vite and test both `?config=experiment.json` and `?config=experiment-zh.json`: consent page appears first, the button is disabled until all four checks, acceptance proceeds to Prolific ID, Konami developer mode works, and exported payloads contain the consent record.

- [ ] **Step 6: Commit verification-only fixes and report**

Run `git status --short --branch` and report branch, task commits, tests, build, smoke URL, and preserved dirty files. Do not push or merge unless separately requested.
