# Core Commenting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add useful bilingual comments for future maintainers and experiment users without changing runtime behavior.

**Architecture:** Comment the boundaries people actually need to understand: protocol ingestion, runtime config loading, interaction/state rules, collision coordinates, rendering coordinate transforms, and export/scoring tools. Avoid line-by-line narration; comments explain experimental meaning, Rhino/player coordinate semantics, and irreversible workflow decisions.

**Tech Stack:** TypeScript, Vitest, Vite, Markdown docs, existing `pixi` tasks.

---

## File Structure

- Create: `docs/code-commenting-guidelines.md`
  - Project comment style guide. English first, Chinese for experiment/Rhino semantics.
- Modify: `src/core/config-loader.ts`
  - Explain authoring config -> runtime config, SVG viewBox sizing, asset resolution, and collider mapping.
- Modify: `src/core/layout-task-player.ts`
  - Explain product lifecycle: load, render, wire controllers, record, teardown.
- Modify: `src/core/flow-controller.ts`
  - Explain direct reconstruction vs preview-then-reconstruct timing.
- Modify: `src/core/state-store.ts`
  - Explain movement/rotation offsets, limits, collision gate, and initial vs answer state.
- Modify: `src/core/interaction-controller.ts`
  - Explain behavior layer and blocked-action semantics.
- Modify: `src/core/collision-geometry.ts`
  - Explain contain/block/object collision policy, convex polygons, edge contact, and asset-outline assumptions.
- Modify: `src/core/object-collider-svg.ts`
  - Explain collider SVG parser limits, ignored template containers, and local coordinate output.
- Modify: `src/core/renderer.ts`
  - Add section comments only around stage coordinate conversion, object/control layers, fixed-object click behavior, and overflow controls.
- Modify: `protocol/adaptor/assemble-stimuli-csv.ts`
  - Explain CSV protocol assembly, bbox/viewBox sizing, same-name collider attachment, and why missing sidecars do not fail assembly.
- Modify: `tools/decoder/decoder-utils.ts`
  - Tighten existing comments around validation and table outputs.
- Modify: `tools/scoring/scoring-utils.ts`
  - Explain relative target scoring and optional absolute analysis values.

Do not modify test files except if a comment update uncovers a wrong assumption in a test name. Do not reformat files.

---

## Comment Style Rules

Use this style in every touched file:

```ts
// ===== 1. Runtime config assembly =====
// Authoring files are split for humans/generators; RuntimeTaskConfig is the
// browser-ready shape. 这里把协议语义收口，后面模块不再猜 task JSON 的来源。
```

Use a short block before a dense function when a future reader needs the mental model:

```ts
// Candidate movement is checked before mutating state.
// 被试看到的是“动作被挡住”，不是“移动后又弹回去”。
```

Skip comments like:

```ts
// Increment index.
index += 1;
```

---

## Task 1: Add Commenting Guidelines

**Files:**
- Create: `docs/code-commenting-guidelines.md`

- [ ] **Step 1: Create the guideline document**

Add:

```md
# Code Commenting Guidelines

This project uses comments for domain meaning, not for TypeScript syntax.

## Audience

- Future experiment author/maintainer.
- Users adapting Rhino/GH exports into Layout Task protocol packages.

## Style

- English first.
- Add Chinese when the comment explains experiment semantics, Rhino/CAD export assumptions, or analysis consequences.
- Prefer short section comments before dense blocks.
- Explain why a rule exists, what coordinate system a value lives in, or what offline analysis will assume.

## Good

```ts
// Runtime object polygons are in rendered object-local coordinates.
// collider SVG 可以用自己的 viewBox；loader 会映射到 0..width / 0..height。
```

## Bad

```ts
// Set x to point.x.
const x = point.x;
```

## Do Not

- Do not add comments to every branch.
- Do not restate variable names.
- Do not document speculative future features.
- Do not change behavior while adding comments.
```

- [ ] **Step 2: Check the document**

Run: `Get-Content -Raw docs/code-commenting-guidelines.md`

Expected: file exists and contains no `TODO`, `TBD`, or placeholder wording.

- [ ] **Step 3: Commit**

```bash
git add docs/code-commenting-guidelines.md
git commit -m "docs: add code commenting guidelines"
```

---

## Task 2: Comment Runtime Config Ingestion

**Files:**
- Modify: `src/core/config-loader.ts`

- [ ] **Step 1: Add section comments around config loading**

Add comments before these existing regions:

```ts
// ===== 1. Select and fetch authoring files =====
// The authoring package is generator-friendly: manifest, task, asset libraries,
// and behavior libraries are separate files. Runtime loading joins them once so
// later modules can treat config as already resolved.
```

```ts
// ===== 2. Attach inline SVG text for sizing/rendering =====
// SVG viewBox can be the source of truth for 1:1 CAD/Rhino exports.
// If JSON gives explicit dimensions, JSON wins; otherwise we inspect SVG text.
```

```ts
// ===== 3. Resolve object collider sidecars =====
// asset_outline is authoring sugar. Runtime collision consumes polygons only,
// so collider SVG points are mapped into rendered object-local coordinates here.
```

- [ ] **Step 2: Add comments around sizing helpers**

Add:

```ts
// Object dimensions are world-unit dimensions used for rendering and collision.
// For Rhino packages, explicit bbox-derived dimensions are safest; SVG viewBox
// inference is for assets whose viewBox is already in task-space units.
```

```ts
// Background placement is different from object sizing: a background SVG can
// provide x/y/width/height through its root viewBox because it already lives in
// the room coordinate system.
```

- [ ] **Step 3: Verify no behavior changed**

Run: `npm run test -- src/core/config-loader.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/config-loader.ts
git commit -m "docs: explain runtime config ingestion"
```

---

## Task 3: Comment Player Lifecycle and Flow

**Files:**
- Modify: `src/core/layout-task-player.ts`
- Modify: `src/core/flow-controller.ts`

- [ ] **Step 1: Add lifecycle comments in `layout-task-player.ts`**

Add:

```ts
// ===== Player lifecycle =====
// The product core does four things in order: load runtime config, render DOM/SVG,
// wire controllers, then record/export the final payload. Adapters such as
// standalone main.ts or jsPsych should stay thin.
```

```ts
// Render before measuring display info.
// 这样记录的是被试看见的实际布局，而不是配置里“应该出现”的布局。
```

- [ ] **Step 2: Add flow comments in `flow-controller.ts`**

Add:

```ts
// Flow controls experiment phases, not object behavior.
// direct_reconstruction starts interactive; preview_then_reconstruct gates
// interaction until the reference image has been studied for the configured time.
```

```ts
// Preview time is recorded as an extra phase metric.
// Main result duration still starts when the player page starts, matching survey timing.
```

- [ ] **Step 3: Verify**

Run: `npm run test -- src/core/layout-task-player.test.ts src/core/flow-controller.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/layout-task-player.ts src/core/flow-controller.ts
git commit -m "docs: explain player lifecycle and flow phases"
```

---

## Task 4: Comment State and Interaction Rules

**Files:**
- Modify: `src/core/state-store.ts`
- Modify: `src/core/interaction-controller.ts`

- [ ] **Step 1: Add state rule comments**

Add:

```ts
// ===== Object state model =====
// The initial pose is what the participant starts from during reconstruction.
// For variable objects, the correct answer is usually target.relative: signed
// movement/rotation steps from this initial pose, not a separate hidden object.
```

```ts
// Limits are offset limits, not click-count limits.
// A participant can move left and then move right back through the origin because
// the experimental constraint is final displacement from the start pose.
```

```ts
// Collision is a candidate-pose gate.
// We test the next pose before mutation so blocked actions leave no temporary
// state that later code has to undo.
```

- [ ] **Step 2: Add interaction comments**

Add:

```ts
// InteractionController translates UI gestures into StateStore actions.
// It is the right place to record blocked attempts because the user intended
// an action even when StateStore rejects the candidate pose.
```

```ts
// Fixed/context objects remain visible and may collide, but they should not be
// selected as reconstruction targets. variable objects carry participant actions.
```

- [ ] **Step 3: Verify**

Run: `npm run test -- src/core/state-store.test.ts src/core/interaction-controller.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/state-store.ts src/core/interaction-controller.ts
git commit -m "docs: explain state and interaction rules"
```

---

## Task 5: Comment Collision Semantics

**Files:**
- Modify: `src/core/collision-geometry.ts`
- Modify: `src/core/object-collider-svg.ts`

- [ ] **Step 1: Add collision policy comments**

Add:

```ts
// ===== Collision policy =====
// Collision is intentionally discrete: every button move, rotation, or drag
// candidate is accepted or rejected as a whole. We do not compute partial slides.
```

```ts
// contain areas are allowed regions. If none are authored, world.viewBox becomes
// the default allowed region. block areas are obstacles inside that region.
```

```ts
// Edge contact is allowed because CAD/Rhino layouts often place furniture flush
// with walls or other context objects. Positive overlap is the collision.
```

- [ ] **Step 2: Add collider parser comments**

Add:

```ts
// ===== Object collider SVG parser =====
// This parser is deliberately small. Collider SVGs are analysis assets, not
// arbitrary artwork: filled rect/polygon/closed path become solid polygons.
```

```ts
// defs/symbol/metadata containers are templates or labels, not rendered solids.
// Ignoring them prevents hidden reusable shapes from becoming phantom colliders.
```

```ts
// The parser returns SVG-local points plus the root viewBox. ConfigLoader owns
// mapping those points into rendered object-local coordinates.
```

- [ ] **Step 3: Verify**

Run: `npm run test -- src/core/collision-geometry.test.ts src/core/object-collider-svg.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/collision-geometry.ts src/core/object-collider-svg.ts
git commit -m "docs: explain collision semantics"
```

---

## Task 6: Comment Renderer Coordinate and Control Layers

**Files:**
- Modify: `src/core/renderer.ts`

- [ ] **Step 1: Add top-level renderer comments**

Add near the renderer entry:

```ts
// Renderer owns DOM/SVG shape, not experiment rules.
// It converts between browser pixels and world coordinates, draws objects,
// and exposes UI events for InteractionController.
```

- [ ] **Step 2: Add comments around world/pointer conversion**

Add:

```ts
// Pointer coordinates arrive in viewport pixels. Convert once into world units
// so StateStore and collision never need to know about CSS scale or browser zoom.
```

- [ ] **Step 3: Add comments around object layers and controls**

Add:

```ts
// Object visuals and controls are separate layers.
// Controls render after furniture so arrows stay clickable even when furniture
// is near a stage edge or overlaps context artwork.
```

```ts
// Control positions are derived from rendered object dimensions.
// 这样大/小家具都能得到相近的点击距离，不再依赖某个椅子尺寸写死。
```

- [ ] **Step 4: Verify**

Run: `npm run test -- src/core/renderer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/renderer.ts
git commit -m "docs: explain renderer coordinates and controls"
```

---

## Task 7: Comment Adaptor and Analysis Tools

**Files:**
- Modify: `protocol/adaptor/assemble-stimuli-csv.ts`
- Modify: `tools/decoder/decoder-utils.ts`
- Modify: `tools/scoring/scoring-utils.ts`

- [ ] **Step 1: Add adaptor comments**

Add:

```ts
// ===== Stimuli CSV -> protocol batch =====
// The Rhino/GH side can export many facts, but metric_trial_protocol_json is
// the source of truth for the Player protocol. The adaptor only fills packaging
// details such as asset libraries, copied paths, and optional collider sidecars.
```

```ts
// Missing collider sidecars are tolerated during assembly.
// This lets authors run the adaptor before copying every asset; validate/compile
// and browser loading remain the places that prove the final package is complete.
```

- [ ] **Step 2: Add decoder comments**

Add:

```ts
// Decoder tools are for research QC, not gameplay replay.
// They decode transport strings, flatten tables, and catch impossible records
// without trying to infer participant intention.
```

- [ ] **Step 3: Add scoring comments**

Add:

```ts
// Scoring compares participant final state to authored targets.
// relative targets are the canonical task answer; absolute targets are optional
// analysis data when a researcher wants world-coordinate checks too.
```

- [ ] **Step 4: Verify**

Run: `npm run test -- protocol/adaptor/assemble-stimuli-csv.test.ts tools/decoder/decoder-utils.test.ts tools/scoring/scoring-utils.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add protocol/adaptor/assemble-stimuli-csv.ts tools/decoder/decoder-utils.ts tools/scoring/scoring-utils.ts
git commit -m "docs: explain adaptor and analysis tools"
```

---

## Task 8: Final Verification and Review

**Files:**
- Review all modified files from Tasks 1-7.

- [ ] **Step 1: Scan for noisy comments**

Run:

```powershell
rg -n "Increment|Set .* to|TODO|TBD|later|for future" docs/code-commenting-guidelines.md src/core protocol/adaptor tools/decoder tools/scoring
```

Expected: no new low-value comments or placeholders. Existing legitimate prose can remain if it is not introduced by this work.

- [ ] **Step 2: Run full tests**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review`.

Reviewer brief:

```text
Review the comment-only diff. Look for comments that are wrong, misleading,
too verbose, or explain syntax instead of domain meaning. Confirm no runtime
behavior changed.
```

- [ ] **Step 5: Commit review fixes**

If review requires changes:

```bash
git add docs/code-commenting-guidelines.md src/core protocol/adaptor tools/decoder tools/scoring
git commit -m "docs: refine core comments after review"
```

If review has no required changes, skip this commit.

---

## Self-Review

- Spec coverage: future maintainer and user-facing needs are covered by comments around protocol ingestion, Rhino sizing, runtime state, collision, rendering, adaptor, decoder, and scoring.
- Placeholder scan: no `TODO`, `TBD`, or unspecified implementation steps.
- Type consistency: file names and commands match the current repository.
- Scope control: tests and small utility files are intentionally skipped unless they are part of user-facing data flow.
