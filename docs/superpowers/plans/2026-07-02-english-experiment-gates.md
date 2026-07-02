# English Experiment Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GitHub Pages demo experiment English-only, add a tutorial-to-formal start page, and keep users in edit mode until confidence is chosen.

**Architecture:** Reuse existing `ConfidenceController`, `InteractionController`, jsPsych instructions plugin, and demo JSON. No i18n framework or new UI component is introduced.

**Tech Stack:** TypeScript, Vitest, jsPsych, Vite static assets.

---

## File Map

- Modify `src/core/interaction-controller.ts`: replace participant-facing confidence gate status strings with English.
- Modify `src/core/renderer.ts`: replace confidence control title and chosen-confidence status text with English.
- Modify `src/core/completion-controller.ts`: replace missing-confidence submit status with English.
- Modify `src/core/tutorial-controller.ts`: replace tutorial bubble messages with English.
- Modify `src/experiment-runner.ts`: insert the tutorial-complete instructions page and replace final/end-page text with English.
- Modify `src/experiment-runner.test.ts`: verify tutorial-complete page ordering.
- Modify `src/core/interaction-controller.test.ts`: verify English confidence prompt on deselect/switch.
- Modify `src/core/completion-controller.test.ts`: verify English submit confidence prompt.
- Modify `public/experiment/experiment.json`: replace confidence labels with English.
- Modify `public/experiment/layout-task/tasks/tutorial_room.json`, `scene_001.json`, `scene_002.json`: replace Chinese flow copy with English.

---

### Task 1: English Confidence Gate Copy

**Files:**
- Modify: `src/core/interaction-controller.test.ts`
- Modify: `src/core/completion-controller.test.ts`
- Modify: `src/core/interaction-controller.ts`
- Modify: `src/core/completion-controller.ts`
- Modify: `src/core/renderer.ts`

- [ ] **Step 1: Update failing interaction tests**

In `src/core/interaction-controller.test.ts`, update the existing confidence gate expectations:

```ts
expect(renderer.setStatus).toHaveBeenLastCalledWith(
  "Choose a confidence rating for this furniture group before exiting edit mode.",
);
```

Use the same expected string for both the deselect and switch-object confidence gate tests.

- [ ] **Step 2: Update failing completion test**

In `src/core/completion-controller.test.ts`, update the missing-confidence submit expectation to:

```ts
expect(renderer.setStatus).toHaveBeenCalledWith(
  "Choose a confidence rating for every furniture group before submitting.",
);
```

- [ ] **Step 3: Run tests and verify they fail for old Chinese copy**

Run:

```bash
npm run test -- src/core/interaction-controller.test.ts src/core/completion-controller.test.ts
```

Expected: FAIL because implementation still emits Chinese confidence prompts.

- [ ] **Step 4: Replace confidence gate implementation strings**

In `src/core/interaction-controller.ts`, replace both confidence gate status strings with:

```ts
this.options.renderer.setStatus("Choose a confidence rating for this furniture group before exiting edit mode.");
```

In `src/core/completion-controller.ts`, replace missing-confidence submit status with:

```ts
this.options.renderer.setStatus("Choose a confidence rating for every furniture group before submitting.");
```

In `src/core/renderer.ts`, replace the confidence title:

```ts
title.textContent = "Choose your confidence rating for this furniture group";
```

And replace chosen status with:

```ts
this.setStatus(`Confidence rating selected: ${button.textContent}`);
```

- [ ] **Step 5: Run tests and verify they pass**

Run:

```bash
npm run test -- src/core/interaction-controller.test.ts src/core/completion-controller.test.ts
```

Expected: PASS.

---

### Task 2: Tutorial-To-Formal Transition Page

**Files:**
- Modify: `src/experiment-runner.test.ts`
- Modify: `src/experiment-runner.ts`

- [ ] **Step 1: Update failing timeline test**

In `src/experiment-runner.test.ts`, update the tutorial timeline test to expect five entries:

```ts
expect(timeline).toHaveLength(5);
expect(timeline[0]).toMatchObject({ type: LayoutTaskPlugin, taskId: "tutorial_room", tutorialMode: true });
expect(timeline[1]).toMatchObject({
  pages: [
    "<h1>Tutorial complete.</h1><p>The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.</p>",
  ],
  button_label_next: "Start formal experiment",
});
expect(timeline[2]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_001", qid: "Q001" });
expect(timeline[3]).toMatchObject({ type: LayoutTaskPlugin, taskId: "scene_002", qid: "Q002" });
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm run test -- src/experiment-runner.test.ts
```

Expected: FAIL because the transition page is not inserted.

- [ ] **Step 3: Insert instructions page after tutorial**

In `src/experiment-runner.ts`, after pushing the tutorial `LayoutTaskPlugin` trial, push:

```ts
timeline.push({
  type: InstructionsPlugin,
  pages: [
    "<h1>Tutorial complete.</h1><p>The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.</p>",
  ],
  show_clickable_nav: true,
  button_label_next: "Start formal experiment",
});
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
npm run test -- src/experiment-runner.test.ts
```

Expected: PASS.

---

### Task 3: English Demo And Tutorial Text

**Files:**
- Modify: `src/core/tutorial-controller.test.ts`
- Modify: `src/core/tutorial-controller.ts`
- Modify: `src/experiment-runner.ts`
- Modify: `public/experiment/experiment.json`
- Modify: `public/experiment/layout-task/tasks/tutorial_room.json`
- Modify: `public/experiment/layout-task/tasks/scene_001.json`
- Modify: `public/experiment/layout-task/tasks/scene_002.json`

- [ ] **Step 1: Update tutorial test expected messages if needed**

If `src/core/tutorial-controller.test.ts` asserts Chinese tutorial copy, replace those expectations with English messages from Step 3.

- [ ] **Step 2: Run tutorial test and verify old copy fails**

Run:

```bash
npm run test -- src/core/tutorial-controller.test.ts
```

Expected: FAIL if the test checks message content; otherwise PASS and continue.

- [ ] **Step 3: Replace tutorial bubble text**

In `src/core/tutorial-controller.ts`, use these English messages:

```ts
"You will first study an image. Remember the position and orientation of each furniture group, then reconstruct the scene from memory."
"Click a furniture group to enter edit mode."
"Use the controls to move or rotate this furniture group."
"Choose a confidence rating for this furniture group."
"Click the stage background to exit edit mode."
"Now select another furniture group. You must choose confidence for the current group before switching."
"Adjust this group, then choose its confidence rating."
"Submit the tutorial result."
"Tutorial complete."
```

- [ ] **Step 4: Replace experiment runner final/end-page text**

In `src/experiment-runner.ts`, replace the final timeline instructions trial:

```ts
pages: ["Experiment complete. Data is being saved."],
button_label_next: "Finish",
```

Replace `renderEndPage` text:

```ts
title.textContent = saveResult.ok ? "Experiment complete. Data saved." : "Experiment complete, but automatic saving failed.";
detail.textContent = saveResult.ok ? "Thank you for participating." : `Please copy or download the data. Error: ${saveResult.error ?? "Unknown error"}`;
```

- [ ] **Step 5: Replace demo JSON text**

In `public/experiment/experiment.json`, replace confidence labels:

```json
"labels": {
  "1": "Very unsure",
  "2": "Unsure",
  "3": "Neutral",
  "4": "Sure",
  "5": "Very sure"
}
```

In each of `tutorial_room.json`, `scene_001.json`, and `scene_002.json`, replace:

```json
"message_after": "Reconstruct the scene from memory."
```

- [ ] **Step 6: Scan participant-facing demo files for Chinese characters**

Run:

```bash
rg -n "[\u4e00-\u9fff]" src/core src/experiment-runner.ts public/experiment
```

Expected: no matches in participant-facing strings. If matches are code comments, leave them only if they are not participant-visible.

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test -- src/core/tutorial-controller.test.ts src/experiment-runner.test.ts
```

Expected: PASS.

---

### Task 4: Full Verification And Deployment

**Files:**
- No source changes unless verification reveals a bug.

- [ ] **Step 1: Run full test suite**

Run:

```bash
pixi run test
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

Run:

```bash
pixi run build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Validate experiment package**

Run:

```bash
pixi run validate-experiment-package public/experiment
```

Expected:

```json
{
  "ok": true,
  "failures": []
}
```

- [ ] **Step 4: Browser smoke test locally**

Open:

```text
http://127.0.0.1:5173/experiment/
```

Verify:

- Tutorial starts in English.
- Missing confidence blocks exit and shows the English confidence prompt.
- After tutorial submit, the formal-start page appears.
- The formal-start page button says `Start formal experiment`.

- [ ] **Step 5: Push and verify GitHub Pages**

Push the updated `feature/flow-preview-reconstruct` bookmark, wait for Pages deployment, then open:

```text
https://eastnoob.github.io/LayoutTask_Player/experiment/
```

Verify the same smoke checks as Step 4.

---

## Self-Review

- Spec coverage: confidence gate, tutorial transition, English-only participant UI, and verification are covered.
- Placeholder scan: no TBD/TODO/placeholder language remains.
- Type consistency: plan uses existing files and current method names only.
