# Tutorial Interaction Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the confirmed bilingual tutorial and player changes without losing existing consent, demographic, timing, asset, or static-release behavior.

**Architecture:** Keep the existing `TutorialController`, `LayoutTaskPlayer`, `LayoutTaskRenderer`, `ConfidenceController`, `ExperimentPauseController`, and result pipeline. Add only a small `MagnifierController` for the observation-only mode, extend the tutorial state/events for the two mandatory practices and save-based completion, and derive red completion highlighting from the existing confidence/save facts. Store magnifier timing in the existing task result and export paths; do not create a second upload or tracking protocol.

**Tech Stack:** TypeScript, Vitest, Vite, jsPsych 8, DOM/SVG/CSS, Playwright Chromium/WebKit regression script, existing static-package generator and validators.

**Spec:** `docs/superpowers/specs/2026-10-13-tutorial-interaction-design.md`

## Global Constraints

- All user-facing changes are synchronized in English and Chinese.
- The static web package is self-contained and must include every referenced image, GIF, SVG, icon, JSON, task, manifest, and tutorial lock file.
- Preserve the first consent document, reading/scrolling gates, age flow, corrective-eyewear flow, existing assignment/session identity, and historical result compatibility.
- Do not modify original PDF files, `References`, VPS state, WebDAV archives, production data, or unrelated user changes.
- Keep `layouttask.result.v1`; new magnifier fields are optional and old results remain readable.
- A furniture object is complete only after both confidence dimensions are selected and Save succeeds; zero movement is valid, and later re-editing remains unlimited.
- Formal Pause accounting remains separate from magnifier accounting; tutorial Pause practice does not consume the formal allowance.
- Do not add mouse trajectories, frame-by-frame imagery, magnifier zoom logs, or a new timing file.

---

### Task 1: Lock Down Bilingual Copy and Consent Scope

**Files:**
- Modify: `src/core/experiment-consent.ts`
- Modify: `src/core/messages.ts`
- Modify: `src/experiment-runner.ts`
- Test: `src/core/experiment-consent.test.ts`
- Test: `src/core/bilingual-consent-config.test.ts`
- Test: `src/core/messages.test.ts`
- Test: `src/experiment-runner.test.ts` if present; otherwise add the smallest source-level assertion beside the existing runner tests

**Interfaces:**
- Preserve the existing `ConsentRecord` fields needed to read v1 history.
- New consent records use `consent_version: "informed-consent-2026-10-13-v2"`, contain the four displayed confirmations, and omit `notice_version` and `data_protection_statement_confirmed`.
- `instruction_edit_mode` must no longer contain the repeated picture/reconstruction/confidence paragraph in either locale.

- [x] **Step 1: Add failing consent tests.** Assert that the English and Chinese consent HTML contain the first informed-consent content, age/eyewear flow remains available, the GDPR data-protection section and fifth checkbox are absent, and exactly four displayed confirmations gate continuation.

- [x] **Step 2: Add failing record/export tests.** Assert that a new v2 consent record omits the removed-document fields, while a supplied v1 record remains readable and exports its historical fields unchanged.

- [x] **Step 3: Add failing copy tests.** Replace the current `messages.test.ts` expectation for the repeated `instruction_edit_mode` text with an expectation that the string is absent while confidence labels, reconstruction hints, and no-information copy remain present.

- [x] **Step 4: Implement the smallest copy and consent changes.** Delete only the second document's HTML and checkbox, update the completion/signature wording to one document, update the record factory, replace the tutorial completion withdrawal sentence with `You may not receive payment as a result of this.` / `您可能因此无法获得报酬。`, and remove the repeated edit-page instruction. Do not change reward calculation.

- [x] **Step 5: Run focused tests.**

  ```powershell
  npx vitest run src/core/experiment-consent.test.ts src/core/bilingual-consent-config.test.ts src/core/messages.test.ts
  ```

  Expected: PASS, with no assertion requiring the removed paragraph or removed data-protection confirmation.

- [x] **Step 6: Commit only this task's files.**

  ```powershell
  git add src/core/experiment-consent.ts src/core/experiment-consent.test.ts src/core/bilingual-consent-config.test.ts src/core/messages.ts src/core/messages.test.ts src/experiment-runner.ts
  git commit -m "fix: reduce consent and repeated task copy"
  ```

### Task 2: Replace the Tutorial Step Model with the Confirmed Gates

**Files:**
- Modify: `src/core/tutorial-controller.ts`
- Modify: `src/core/tutorial-controller.test.ts`
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/confidence-controller.ts` only if an existing saved-state query is missing
- Modify: `src/core/interaction-controller.ts` only if existing save/select blocking cannot expose the needed facts
- Modify: `src/core/completion-controller.ts`
- Test: `src/core/layout-task-player.test.ts`
- Test: `src/core/confidence-controller.test.ts` if existing; otherwise keep the new assertions in the nearest existing controller test

**Interfaces:**
- Extend `TutorialEvent` with explicit events for magnifier entry/real zoom/exit, Pause confirmation/resume, and first successful object save.
- `TutorialController.isInteractionBlocked()` must block all actions except the current mandatory practice and its allowed exit/confirmation actions.
- Tutorial completion must require: magnifier practice complete, Pause practice complete, every required group saved at least once, no unsaved confidence, no pending Pause confirmation/active Pause, no active magnifier.

- [x] **Step 1: Add failing controller tests for the exact sequence.** Cover intro, viewing-direction acknowledgement clearing the arrow, reference-board pages before player interaction, magnifier practice, first object selection, zero-movement confidence selection, first Save, Pause practice, remaining objects, and final submission.

- [x] **Step 2: Add failing tests for completion facts.** Verify that selecting or opening an object does not clear its pending state; choosing only one confidence does not complete it; Save with both ratings does; re-editing does not restore pending state; the tutorial cannot jump to a later object or submit before mandatory practices.

- [x] **Step 3: Implement the minimal state/event changes.** Keep the controller as a small ordered state machine. Add persistent per-group first-save state only for tutorial guidance, and obtain the actual saved answer from `ConfidenceController`/existing interaction state rather than duplicating formal answer data.

- [x] **Step 4: Wire player and completion checks.** Route Save, Pause, magnifier, and submit events through `advanceTutorial`; ensure developer shortcuts cannot bypass tutorial gates; retain the formal task's existing save and completion behavior.

- [x] **Step 5: Run focused tests.**

  ```powershell
  npx vitest run src/core/tutorial-controller.test.ts src/core/layout-task-player.test.ts src/core/completion-controller.test.ts
  ```

- [x] **Step 6: Commit the tutorial gate changes.**

  ```powershell
  git add src/core/tutorial-controller.ts src/core/tutorial-controller.test.ts src/core/layout-task-player.ts src/core/completion-controller.ts src/core/confidence-controller.ts src/core/interaction-controller.ts src/core/layout-task-player.test.ts
  git commit -m "feat: gate tutorial on saved objects and practices"
  ```

### Task 3: Add Red Pending-State Feedback and Final Tutorial Copy

**Files:**
- Modify: `src/core/renderer.ts`
- Modify: `src/styles/layout-task.css`
- Modify: `src/core/tutorial-controller.ts`
- Modify: `src/core/tutorial-reference-board.ts` only for the confirmed bilingual board callout if needed
- Test: `src/core/renderer.test.ts`
- Test: `src/core/tutorial-controller.test.ts`

**Interfaces:**
- Renderer receives a read-only `isObjectFirstSaveComplete(objectId)` or equivalent query; it must not maintain a second answer-completion store.
- Pending red feedback applies independently to tutorial and formal tasks, starts when the task starts, disappears only after the first successful Save for that furniture group, and never changes click areas, collisions, scoring, or yellow fill.

- [x] **Step 1: Add failing renderer tests for pending state.** Assert that every required variable object is marked pending at start, a click/drag/rotation/confidence selection leaves it pending, first Save removes it, and re-editing does not restore it.

- [x] **Step 2: Add failing copy assertions.** Assert every tutorial bubble begins with a separate `Your task:` / `你的任务：` paragraph, only `yellow object(s)` / `黄色物体` is red and bold, and the removed generic edit-page sentence is absent from all scenes.

- [x] **Step 3: Implement the visual state.** Add a quiet non-flashing red outline/glow class to pending editable objects, preserve existing selected/collision feedback precedence, and update it after Save through the existing renderer refresh path.

- [x] **Step 4: Replace the verbose tutorial messages with the approved table in spec section 8.** Keep the persistent-mode distinction, direction-arrow lifecycle, optional reference-board dragging, unlimited re-editing, and Save wording.

- [x] **Step 5: Run focused tests and inspect computed classes.**

  ```powershell
  npx vitest run src/core/renderer.test.ts src/core/tutorial-controller.test.ts
  ```

- [x] **Step 6: Commit.**

  ```powershell
  git add src/core/renderer.ts src/styles/layout-task.css src/core/tutorial-controller.ts src/core/tutorial-reference-board.ts src/core/renderer.test.ts src/core/tutorial-controller.test.ts
  git commit -m "feat: show pending furniture and concise tutorial tasks"
  ```

### Task 4: Implement Observation-Only Magnifier Mode [complete: df7d017]

**Files:**
- Create: `src/core/magnifier-controller.ts`
- Test: `src/core/magnifier-controller.test.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/core/layout-task-player.ts`
- Verify/reuse: `src/core/tutorial-controller.ts` (existing practice state machine already satisfies the brief; no no-op edit)
- Modify: `src/styles/layout-task.css`
- Test: `src/core/renderer.test.ts`
- Test: `src/core/layout-task-player.test.ts`

**Interfaces:**
- `MagnifierController` exposes `enter(at)`, `exit(at)`, `isActive()`, `getZoom()`, `wheel(delta, at)`, and `snapshot()` returning `{ use_count, total_duration_ms }`.
- Default zoom is `2`; wheel changes by `0.25`; clamp to `1.5..4`; one successful entry increments count; duration includes immediate exits and incomplete tutorial practice.
- While active, only pointer movement over the floor plan, wheel, and `Escape` are accepted. Furniture, confidence, Save, Confirm, Pause, browser-style shortcuts, and direct callbacks are blocked.

- [x] **Step 1: Add failing controller tests.** Cover default/boundary zoom, actual wheel changes, repeated wheel clamping, one count per entry, immediate ESC, duration accumulation, and no overlap with Pause intervals.

- [x] **Step 2: Add failing player/renderer tests.** Assert that entering while editing preserves pose, selection, and unsaved confidence; ESC exits only the magnifier; focus returns to the prior control; the main zoom/pan/reset tools are absent or hidden as specified.

- [x] **Step 3: Implement the controller.** Use the runtime's epoch-millisecond clock, crop intervals to the task window, and do not log pointer paths or zoom steps.

- [x] **Step 4: Implement the renderer mode.** Add one magnifier icon button for the floor plan, a circular lens following the pointer, visible current/min/max multiplier, and a persistent bilingual ESC instruction. Keep the lens inside the canvas edge without changing the pointed world position. Freeze all other input and restore the prior editing context on ESC.

- [x] **Step 5: Wire tutorial practice.** Require entry, at least one real wheel change, and ESC in the same session; early ESC or entry without a zoom change leaves the practice incomplete and retryable. Make magnifier and Pause mutually exclusive.

- [x] **Step 6: Run focused tests.**

  ```powershell
  npx vitest run src/core/magnifier-controller.test.ts src/core/renderer.test.ts src/core/layout-task-player.test.ts src/core/tutorial-controller.test.ts
  ```

- [x] **Step 7: Commit.**

  ```powershell
  git add src/core/magnifier-controller.ts src/core/magnifier-controller.test.ts src/core/renderer.ts src/core/layout-task-player.ts src/core/tutorial-controller.ts src/styles/layout-task.css src/core/renderer.test.ts src/core/layout-task-player.test.ts src/core/tutorial-controller.test.ts
  git commit -m "feat: add observation-only floor-plan magnifier"
  ```

### Task 5: Integrate Tutorial Pause Practice and Direction-Arrow Lifecycles [complete: 5059dd1]

**Files:**
- Modify: `src/core/experiment-pause.ts`
- Modify: `src/core/experiment-pause-ui.ts`
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/renderer.ts`
- Modify: `src/core/tutorial-controller.ts`
- Modify: `src/styles/layout-task.css`
- Test: `src/core/experiment-pause.test.ts`
- Test: `src/core/experiment-pause-ui.test.ts`
- Test: `src/core/tutorial-controller.test.ts`

**Interfaces:**
- Tutorial Pause uses `mode: "tutorial_practice"`, has a maximum of 10 seconds, and does not increment or consume the formal Pause allowance.
- A canceled confirmation is incomplete; manual Resume and `auto_resume_10s` complete the practice.
- The yellow direction arrow and Pause arrow/highlight are separate UI states. Direction arrow disappears immediately after acknowledgement; Pause guidance clears after successful practice and never appears in formal scenes.

- [x] **Step 1: Add failing Pause tests.** Cover cancel, confirm, manual Resume, automatic 10-second Resume, formal allowance unchanged, and magnifier/Pause mutual exclusion.

- [x] **Step 2: Implement the tutorial practice mode and localized dialog copy.** Reuse the existing Pause controller/UI and keep formal 15-minute behavior unchanged.

- [x] **Step 3: Add failing renderer tests for arrow/highlight lifetimes.** Confirm the direction arrow clears after the first confirmation and the Pause button highlight/yellow arrow appears only during the practice.

- [x] **Step 4: Wire Pause practice into the ordered tutorial state and submission gate.** Do not rely on a hidden/disabled button alone; CompletionController must reject unfinished practice.

- [x] **Step 5: Run focused tests and commit.**

  ```powershell
  npx vitest run src/core/experiment-pause.test.ts src/core/experiment-pause-ui.test.ts src/core/tutorial-controller.test.ts src/core/layout-task-player.test.ts
  git add src/core/experiment-pause.ts src/core/experiment-pause-ui.ts src/core/layout-task-player.ts src/core/renderer.ts src/core/tutorial-controller.ts src/styles/layout-task.css src/core/experiment-pause.test.ts src/core/experiment-pause-ui.test.ts src/core/tutorial-controller.test.ts
  git commit -m "feat: require and guide tutorial pause practice"
  ```

### Task 6: Persist Magnifier Timing Through Results and Decoder Validation [complete: c318d00]

**Files:**
- Modify: `src/types/result.ts`
- Modify: `src/schemas/result.schema.ts`
- Modify: `src/core/recorder.ts`
- Modify: `src/core/page-timing.ts`
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/encoder.ts`
- Modify: `src/core/experiment-data.ts`
- Modify: `tools/decoder/decoder-utils.ts`
- Test: `src/core/recorder.test.ts`
- Test: `src/core/page-timing.test.ts`
- Test: `src/core/encoder.test.ts`
- Test: `src/core/experiment-data.test.ts`
- Test: `src/schemas/result.schema.test.ts`
- Test: `tools/decoder/decoder-utils.test.ts`

**Interfaces:**
- Add optional result fields:

  ```ts
  magnifier?: { use_count: number; total_duration_ms: number };
  effective_duration_ms?: number;
  ```

- Add optional `page_timing.effective_player_elapsed_ms`.
- `duration_ms` and event `t` keep their existing Pause-only semantics.
- Full and final-only encoding retain the magnifier summary; old payloads without it remain valid.

- [x] **Step 1: Add failing result/schema tests.** Cover zero-use `{ use_count: 0, total_duration_ms: 0 }`, old-result omission, negative/non-finite rejection, and the example `120s wall - 10s Pause - 20s magnifier = 110s duration / 90s effective`.

- [x] **Step 2: Add failing recorder/page-timing tests.** Assert the root summary remains available when `record_page_timing` is false, page timing effective duration is optional, and tutorial/formal task windows are isolated.

- [x] **Step 3: Implement recorder and page-timing propagation.** Inject the controller snapshot beside Pause without changing result schema version or event clock.

- [x] **Step 4: Implement encoder/CSV/debug export propagation.** Keep existing assignment/session/task/trial fields and historical CSV columns. Add magnifier count, total, used/effective durations only where the current export convention supports optional new columns.

- [x] **Step 5: Fix decoder timing validation.** Crop known Pause intervals to the task window before comparing `duration_ms`; validate effective duration against the cropped Pause-plus-magnifier interval. If old evidence is insufficient, emit a compatibility warning rather than assuming zero Pause. The later count-consistency correction is included in `c318d00`.

- [x] **Step 6: Run focused data tests.**

  ```powershell
  npx vitest run src/core/recorder.test.ts src/core/page-timing.test.ts src/core/encoder.test.ts src/core/experiment-data.test.ts src/schemas/result.schema.test.ts tools/decoder/decoder-utils.test.ts
  ```

- [x] **Step 7: Commit.**

  ```powershell
  git add src/types/result.ts src/schemas/result.schema.ts src/core/recorder.ts src/core/page-timing.ts src/core/layout-task-player.ts src/core/encoder.ts src/core/experiment-data.ts tools/decoder/decoder-utils.ts src/core/recorder.test.ts src/core/page-timing.test.ts src/core/encoder.test.ts src/core/experiment-data.test.ts src/schemas/result.schema.test.ts tools/decoder/decoder-utils.test.ts
  git commit -m "feat: record magnifier timing in task results"
  ```

### Task 7: Make the Reference Board Independently Draggable and Asset-Complete [complete: 4814d3a]

**Files:**
- Modify: `src/core/tutorial-reference-board.ts`
- Modify: `src/styles/layout-task.css`
- Modify: `src/experiment-runner.ts`
- Modify: `src/core/tutorial-reference-board.test.ts`
- Modify: `tools/browser/tutorial-regression.html`
- Modify: `tools/browser/tutorial-regression.cjs`
- Verify: `public/experiment/layout-task/assets/icons/hand.svg`
- Verify: all configured tutorial `whole`/`variable` SVG and GIF paths in `public/layout-task-tutorial` and the R12 persistent package

**Interfaces:**
- Each of the two SVG frames has independent translation state and boundary clamping; GIFs remain unchanged.
- The central translucent `hand.svg` prompt is visible by default and on central hover, hides after the first actual movement, and never blocks pointer events.
- A click or press without movement is not a drag; dragging is optional and does not enter the experiment result.

- [x] **Step 1: Add failing reference-board tests.** Assert `background-size: contain` remains, both frames get independent drag state, movement is clamped inside the frame, and the hand asset URL is present.

- [x] **Step 2: Implement pointer drag with per-frame state.** Preserve positions while moving between reference pages and until refresh; do not add zoom/reset controls.

- [x] **Step 3: Add the hand icon and bilingual “Click and hold to drag”/“按住拖动观察” hint.** Confirm the existing local `hand.svg` is copied into every static release path; do not download a remote asset.

- [x] **Step 4: Extend the existing Chromium/WebKit regression page.** Exercise both frames, verify the hand prompt lifecycle, confirm Safari/WebKit SVG edges are not cropped, and capture screenshots at the existing supported viewport sizes.

- [x] **Step 5: Run focused tests and commit.**

  ```powershell
  npx vitest run src/core/tutorial-reference-board.test.ts tools/generator/copy-web-release-assets.test.ts tools/generator/validate-web-release-package.test.ts
  git add src/core/tutorial-reference-board.ts src/styles/layout-task.css src/experiment-runner.ts src/core/tutorial-reference-board.test.ts tools/browser/tutorial-regression.html tools/browser/tutorial-regression.cjs
  git commit -m "feat: make tutorial reference frames draggable"
  ```

### Task 8: End-to-End Browser Verification and Self-Contained Release Checks [complete: 5831d01]

**Files:**
- Modify: `tools/browser/tutorial-regression.cjs`
- Modify: `tools/browser/tutorial-regression.html`
- Modify: `tools/generator/validate-web-release-package.ts`
- Modify: `tools/generator/validate-web-release-package.test.ts`
- Modify: `tools/generator/copy-web-release-assets.test.ts` only if the new hand/magnifier assets need an explicit fixture
- Create: `docs/notes/2026-10-13-tutorial-interaction-implementation-evidence.md`

- [x] **Step 1: Add failing browser assertions for the complete flow.** Run both locales in WebKit and Chromium against a local Vite server with APIs aborted. Cover consent scope, age/eyewear, tutorial opening copy, direction arrow disappearance, reference-board drag, magnifier practice, first zero-movement Save, red glow removal, Pause practice, remaining-object gate, and submission.

- [x] **Step 2: Add asset-closure checks.** Make the release validator inspect actual JSON/manifest/tutorial-lock references recursively, including SVG, GIF, PNG/JPEG, icons, task files, and nested tutorial packages. Keep the existing fixed required paths as a fast baseline.

- [x] **Step 3: Run the full local verification set.**

  ```powershell
  npm test
  npm run build
  npm run validate:web-release
  node tools/browser/tutorial-regression.cjs chromium
  node tools/browser/tutorial-regression.cjs webkit
  ```

  Expected: all commands exit successfully; browser output records no 404s, console errors, blocked necessary assets, or failed gate assertions.

- [x] **Step 4: Validate clean package copies.** Copy each fresh `dist` into a temporary directory with no `.git`, load `/` and `/experiment/`, and check Chinese/English package roots separately. Confirm the root redirects to `/experiment/`, the R12 persistent package is used, and all network requests for tutorial/formal scenes succeed.

- [x] **Step 5: Record evidence.** Write command results, screenshots, package paths, browser engines, unresolved Safari limitation if no physical Safari was tested, and any skipped checks in `docs/notes/2026-10-13-tutorial-interaction-implementation-evidence.md`.

- [x] **Step 6: Commit verification tooling and evidence.**

  ```powershell
  git add tools/browser/tutorial-regression.cjs tools/browser/tutorial-regression.html tools/generator/validate-web-release-package.ts tools/generator/validate-web-release-package.test.ts tools/generator/copy-web-release-assets.test.ts docs/notes/2026-10-13-tutorial-interaction-implementation-evidence.md
  git commit -m "test: verify bilingual self-contained tutorial release"
  ```

### Task 9: Review, Build Fresh Bilingual Packages, and Hold for User Approval [local verification complete]

**Files:**
- Review all changed source/test/tool files from Tasks 1–8.
- Build: fresh `dist` from the current source branch.
- Publish target: the existing static repository, Chinese `main` and English `en-US`, only after the user-authorized release step.

- [x] **Step 1: Run a final diff review.** Check `git diff --check`, inspect changed user-facing copy in both locales, confirm no untracked user files were staged, and verify no original PDF/References/VPS/data files were touched.

- [x] **Step 2: Run `npm test`, `npm run build`, `npm run validate:web-release`, and both browser engines again from a fresh build.** Do not rely on an incremental or stale `dist`.

- [x] **Step 3: Review the generated package as an independent static root.** Confirm all required assets, tutorial lock hashes, manifest paths, icons, hand image, and no `.git` directory.

- [x] **Step 4: Use `superpowers:verification-before-completion` before claiming completion.** Report exact commands and outcomes; distinguish Vitest, Chromium/WebKit, package validation, and physical Safari coverage.

- [ ] **Step 5: Use `superpowers:finishing-a-development-branch` for the final integration choice.** Pending the user's local-page approval; only then choose the authorized push/deployment action.

## 2026-10-14 Local Preview Follow-up

Scope: the user's three local-page corrections, subsequent global non-held magnifier wheel clarification, and two concrete review fixes; no receiver, result-schema, asset, production or deployment changes.

- [x] Add failing tests for reference-board-before-direction ordering, held-wheel zoom limits and independent/restored frame state.
- [x] Implement left-button-held drag plus wheel zoom (1×–4×, 0.25× steps), preserve the background SVG containment workaround and clamp pan after zoom-out.
- [x] Show all four reference pages before the direction arrow in both reference modes; retain the no-board fallback and existing practice/save gates.
- [x] Move bilingual magnifier zoom/ESC hints outside and below the circular lens; keep the magnified scene circularly clipped.
- [x] Apply the user's later correction: active main magnifier wheel zoom works anywhere on the page without a held mouse button; ESC restores normal wheel behavior. Add failing outside-plan tests before removing the renderer event-target guard.
- [x] Close the review's bottom-edge hint clipping and left/right-button chord findings with failing mounted/frame tests and minimal fixes; add a real browser bottom-edge viewport assertion.
- [x] Run fresh full tests (initial follow-up: 67 files/735 tests; global-wheel fix: 67 files/739 tests; review fixes: 67 files/741 tests), build, recursive release validation and independent bilingual package validation.
- [x] Run both packaged language entry flows in Chromium and WebKit, covering the three corrections and existing consent/profile/tutorial/first-formal-scene behavior.
- [x] Refresh local copy-mode previews on ports 5187 (Chinese) and 5188 (English), without production allocation or upload.

Independent review, local commit identifiers and evidence are recorded in `docs/notes/2026-10-13-tutorial-interaction-implementation-evidence.md`. Physical Safari and the complete 23-scene browser run remain untested. Push/deployment still requires the user's local-page approval.

## 2026-10-14 Persistent Glow and Remaining-Save Follow-up

User-approved bounded change: concise bilingual editing bubble, remaining first-save count on Confirm, complete the pending-glow repair, refresh local previews, commit in batches and push source Git only. Static deployment remains explicitly excluded.

- [x] Add failing bilingual copy/count checks, including unsuccessful Save, ratings without Save, repeat Save, dynamic group totals and fixed-object exclusion; implement from existing saved-confidence state without new data fields.
- [x] Replace the visually ineffective SVG-scaled CSS shadow with native `feDropShadow`; measure the camera scale and configure filter bounds after positive visible SVG size. Add a failing hidden-board/resize regression before the timing correction.
- [x] Resolve demonstrated original/lens SVG ID collisions by reusing the existing namespacing helper before clone insertion; assert original/lens resource IDs are unique during real magnifier practice.
- [x] Clear only renderer-owned root lock classes on mount and teardown; verify native confidence Save in the first formal scene rather than assuming tutorial Save covers it.
- [x] Obtain a limited independent continuation assessment: no new Critical/Important findings in clone isolation, Confirm count or copy. Verify actual engine success separately; reviewer did not certify engine runs.
- [x] Fresh `npm test`: 67 files/745 checks pass; build and recursive release validation exit 0. Independent bilingual packages each contain 151 files and validate successfully.
- [x] Chromium and WebKit each finish both local entry flows, 36 entry check groups, 12 board fits and 6 pixel aspect fits. Actual tutorial/formal red halos disappear after native Save; counts descend 4/4 to a star and repeat Save cannot decrement twice.
- [x] Serve the latest self-contained copy-mode packages on 5189 (Chinese) and 5190 (English); preserve earlier package evidence and old 5187/5188 previews. No production allocation or upload.
- [x] Commit the six explicit implementation/test/tool paths as `33414e6`; record spec, discussion and final evidence in a separate documentation commit. Source delivery target is `origin/release/zh-CN`, using a normal fast-forward push; remote ref confirmation determines push completion.
- [ ] Deploy the static Chinese/English branches only after the user approves the local pages and authorizes that separate release.

Final evidence: `docs/notes/2026-10-13-tutorial-interaction-implementation-evidence.md`, section “2026-10-14：常驻红光、精简编辑提示与 Confirm 剩余计数”. Physical Safari and a complete 23-formal-scene browser execution remain untested.

## Self-Review

- Consent scope, age/eyewear preservation, and the corrected payment wording are covered by Task 1.
- Red pending feedback, zero-movement Save, unlimited re-editing, bilingual task paragraphs, and deletion of the repeated scene instruction are covered by Tasks 2–3.
- Magnifier behavior, tutorial gate, input blocking, Pause separation, timing summary, encoder/export compatibility, and decoder validation are covered by Tasks 4–6.
- Reference-board dragging, hand asset inclusion, WebKit containment, and self-contained static release checks are covered by Tasks 7–8.
- Fresh bilingual builds, review, evidence, and deployment authorization are covered by Task 9.
- No task modifies production data, VPS, WebDAV, original PDFs, Blender scenes, or unrelated worktree changes.

