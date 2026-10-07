# Pre-study Consent and Participant Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add the consent-to-prestudy profile flow and carry age/eyewear metadata through all current saves and deployment packages.

**Architecture:** Extend the existing consent bootstrap result with a small participant-profile record. Keep the current consent renderer and export builders as the shared paths; pass the profile through session and export inputs instead of adding a parallel persistence system.

**Tech Stack:** TypeScript, jsPsych, Vitest, Vite, existing IndexedDB/local-backup/DataPipe/export utilities.

**Spec:** `docs/superpowers/specs/2026-10-07-prestudy-consent-profile-design.md`

## Global Constraints

- Keep the complete two-document web text and remove paper-entry lines only.
- Keep five required consent confirmations and electronic-signature wording.
- Collect age and corrective-eyewear use after consent and before tutorial.
- Do not generate a second participant number or alter assignment behavior.
- Cover English, Chinese, and developer modes.
- Do not modify PDFs or unrelated assets.

---

### Task 1: Consent document rendering contract

**Files:**
- Modify: `src/core/experiment-consent.ts`
- Test: `src/core/experiment-consent.test.ts`

- [ ] Add failing tests proving paper-entry lines/signature lines are absent while consent explanatory text remains, and the electronic-signature notice is present in both locales.
- [ ] Run `npm test -- --run src/core/experiment-consent.test.ts` and confirm the new assertions fail.
- [ ] Remove only the paper-entry line elements from both document templates and keep the surrounding text.
- [ ] Run the focused test and confirm it passes.
- [ ] Grill Me check: verify no required PDF paragraph was removed and no input field was added to the document body.
- [ ] Commit: `git add src/core/experiment-consent.ts src/core/experiment-consent.test.ts && git commit -m "fix: render consent documents without paper entry lines"`

### Task 2: Pre-study profile model and page

**Files:**
- Modify: `src/core/experiment-consent.ts`
- Modify: `src/main.ts`
- Modify: `src/styles/layout-task.css`
- Test: `src/core/experiment-consent.test.ts`
- Test: `src/main.test.ts`

- [ ] Add failing tests for required numeric age, unchecked eyewear checkbox, localized warning copy, and no resolution before valid age.
- [ ] Run the focused tests and confirm failure.
- [ ] Implement `ParticipantProfile` with `participant_age` and `requires_corrective_eyewear`, plus a page after consent and before Prolific ID/tutorial.
- [ ] Keep the profile page’s warning on the “This is an experiment, not a test” page, not on the consent document page.
- [ ] Run focused tests and confirm pass.
- [ ] Grill Me check: verify page order is consent -> profile/instructions -> Prolific ID/assignment -> tutorial, and developer mode follows the same page.
- [ ] Commit: `git add src/core/experiment-consent.ts src/main.ts src/styles/layout-task.css src/core/experiment-consent.test.ts src/main.test.ts && git commit -m "feat: collect pre-study age and eyewear profile"`

### Task 3: Session metadata propagation

**Files:**
- Modify: `src/core/experiment-session.ts`
- Modify: `src/experiment-runner.ts`
- Test: `src/core/experiment-session.test.ts`
- Test: `src/experiment-runner.test.ts`

- [ ] Add failing tests proving profile values are stored in the active session and passed to runtime save metadata.
- [ ] Run focused tests and confirm failure.
- [ ] Extend session/bootstrap and runnable-experiment inputs with the profile fields using the existing consent/session metadata path.
- [ ] Run focused tests and confirm pass.
- [ ] Grill Me check: verify the profile does not alter participant or sequence assignment and is preserved across restore.
- [ ] Commit: `git add src/core/experiment-session.ts src/experiment-runner.ts src/core/experiment-session.test.ts src/experiment-runner.test.ts && git commit -m "feat: persist pre-study profile in session metadata"`

### Task 4: CSV, JSON, and DataPipe export

**Files:**
- Modify: `src/core/experiment-data.ts`
- Modify: `src/core/zip-recovery.ts`
- Test: `src/core/experiment-data.test.ts`
- Test: `src/core/zip-recovery.test.ts`

- [ ] Add failing tests asserting both fields appear in session CSV, debug/tutorial JSON, recovery manifest, and DataPipe file contents.
- [ ] Run focused tests and confirm failure.
- [ ] Add the two fields to the existing export input and shared metadata rows/envelopes.
- [ ] Run focused tests and confirm pass.
- [ ] Grill Me check: verify raw Prolific ID and consent fields remain unchanged and all export paths use the same field names.
- [ ] Commit: `git add src/core/experiment-data.ts src/core/zip-recovery.ts src/core/experiment-data.test.ts src/core/zip-recovery.test.ts && git commit -m "feat: export pre-study profile metadata"`

### Task 5: Locale and developer-mode regression coverage

**Files:**
- Modify: `src/core/experiment-consent.test.ts`
- Modify: `src/main.test.ts`
- Modify: `src/experiment-runner.test.ts`

- [ ] Add failing regression tests for Chinese/English copy and developer-mode profile collection.
- [ ] Run focused tests and confirm failure.
- [ ] Adjust only copy or wiring needed for the tests.
- [ ] Run focused tests and confirm pass.
- [ ] Grill Me check: verify no English-only or production-only branch bypasses the new page.
- [ ] Commit: `git add src/core/experiment-consent.test.ts src/main.test.ts src/experiment-runner.test.ts && git commit -m "test: cover bilingual developer prestudy flow"`

### Task 6: Full verification and browser smoke test

**Files:**
- No source changes unless a test exposes a defect.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Start Vite on an available local port.
- [ ] Verify Chinese and English consent pages, internal scrolling, five checkboxes, electronic-signature notice, profile page, required age, default eyewear state, warnings, and developer mode.
- [ ] Grill Me check: verify no paper blank/signature line is visible and profile metadata is visible in a generated save payload.

### Task 7: Commit and static web deployment

**Files:**
- Generated: `dist/`
- Static release checkout: configured `web-release` repository.

- [ ] Build the release package from the verified source.
- [ ] Run `npm run validate:web-release -- dist`.
- [ ] Copy the built package using the repository’s existing release script.
- [ ] Commit the source changes and generated release package separately if required by current repository practice.
- [ ] Push source `release/zh-CN` and static package `main` plus `en-US` only after verification.
- [ ] Grill Me check: confirm both static branches contain the new page and assets, with no unrelated files.
