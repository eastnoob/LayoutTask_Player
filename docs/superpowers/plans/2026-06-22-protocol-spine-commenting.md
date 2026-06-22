# Protocol Spine Commenting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add medium-density, semantics-first comments across the protocol spine so protocol authors, runtime/schema maintainers, and analysis users can read the same files without guessing field meaning or layer boundaries.

**Architecture:** Keep the diff comment-only and stay inside the protocol spine: exported type/interface/schema definitions get JSDoc where semantic context matters, ambiguous fields get short inline comments, and schema tests get only light invariant comments. Work in the isolated worktree branch `feature/protocol-spine-commenting`; do not pull unrelated core/controller/renderer files into this pass.

**Tech Stack:** TypeScript, Zod, Vitest, git worktree, Markdown plans/specs.

---

## File Structure

- Modify: `src/types/config.ts`
  - Authoring-shape semantics for task/world/asset/behavior/flow/collision config.
- Modify: `src/protocol/constants.ts`
  - Stable protocol vocabulary comments only.
- Modify: `src/types/batch.ts`
  - Compiled batch, scoring, target, and reference semantics.
- Modify: `src/types/result.ts`
  - Exported result payload semantics for browser/runtime/analysis readers.
- Modify: `src/types/events.ts`
  - Event transport semantics and blocked-action meaning.
- Modify: `src/schemas/config.schema.ts`
  - Authoring-time schema intent and protocol invariants.
- Modify: `src/schemas/batch.schema.ts`
  - Batch/scoring schema intent and shared-vs-trial invariants.
- Modify: `src/schemas/result.schema.ts`
  - Exported result validation semantics.
- Modify: `src/schemas/config.schema.test.ts`
  - Light comments on invariant-guarding cases only.
- Modify: `src/schemas/batch.schema.test.ts`
  - Light comments on target/shared-flow/collision invariant cases only.
- Modify: `src/schemas/result.schema.test.ts`
  - Light comments on result timing/blocked restore invariant cases only.

Known baseline caveat in this isolated worktree:

- `npm run test` is already red before this change because `src/core/object-collider-svg.test.ts` has 3 unrelated failures on this branch.
- Treat those same three failures as baseline noise unless their count or messages change.

---

### Task 1: Comment Authoring Types and Protocol Vocabulary

**Files:**
- Modify: `src/types/config.ts`
- Modify: `src/protocol/constants.ts`

- [ ] **Step 1: Add top-level authoring-layer JSDoc to `config.ts`**

Add this comment above the first exported type block in `src/types/config.ts`:

```ts
/**
 * Authoring-side protocol types.
 *
 * These shapes stay close to JSON written by researchers, generators, or Rhino/GH
 * adaptors. They describe what can be authored, not the fully resolved runtime
 * config that controllers/renderers consume after loading defaults and libraries.
 * 协议作者看到的就是这一层；运行时模块不应该再反推这些字段原本来自哪里。
 */
```

- [ ] **Step 2: Add JSDoc to world/asset/behavior groups in `config.ts`**

Add or expand comments so these definitions get semantic JSDoc:

```ts
/** Room/world coordinates in authored task space. */
export interface WorldConfig { ... }

/**
 * Shared object asset metadata.
 * `default_width/default_height` are authored world-space dimensions, while
 * `intrinsic_unit` and `viewbox_scale` describe how raw artwork should be
 * interpreted before those world dimensions are resolved.
 */
export interface ObjectAssetConfig { ... }

/**
 * Interaction policy authored for one object before runtime defaults merge in.
 * `movement.mode` decides the primary interaction family; drag-specific support
 * is still carried explicitly through `free_drag`.
 */
export interface BehaviorConfig { ... }
```

- [ ] **Step 3: Add field comments to ambiguous config fields**

Add short inline comments on fields whose semantics are easy to misread:

```ts
export interface ObjectAssetConfig {
  /** Unit used by the raw artwork before world-space sizing is resolved. */
  intrinsic_unit?: WorldUnit;
  /** Optional multiplier applied when SVG viewBox numbers need scaling into task space. */
  viewbox_scale?: number;
}

export interface OutputConfig {
  /** Exported final-state representation, not the internal store format. */
  final_state?: FinalStateMode;
}

export interface PreviewThenReconstructFlowConfig {
  /** Intro modal copy shown before preview starts; `{seconds}` is replaced at runtime. */
  intro_message?: string;
  /** Whether preview waits for an explicit participant acknowledgment before timing starts. */
  require_preview_ack?: boolean;
}
```

- [ ] **Step 4: Add JSDoc to collision, task, and manifest config definitions**

Cover the protocol boundary comments for authored collision/task/library definitions:

```ts
/** Authored room-level collision policy. Areas/sources declare constraints; they are not parsed geometry yet. */
export interface TaskCollisionConfig { ... }

/** One authored reconstruction object instance placed in task/world coordinates. */
export interface TaskObjectConfig { ... }

/** Final authored task JSON before library resolution. */
export interface TaskConfig { ... }
```

- [ ] **Step 5: Add the short vocabulary comment in `constants.ts`**

Add this at the top of `src/protocol/constants.ts`:

```ts
/**
 * Stable protocol vocabulary shared by authoring types, schemas, and tooling.
 * These are protocol words, not presentation-layer enums.
 */
```

- [ ] **Step 6: Run focused regression checks**

Run: `npm run test -- src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts`

Expected:
- PASS for both requested files in this worktree
- no new failures introduced

- [ ] **Step 7: Commit**

```bash
git add src/types/config.ts src/protocol/constants.ts
git commit -m "docs: comment authoring config types"
```

---

### Task 2: Comment Batch, Result, and Event Types

**Files:**
- Modify: `src/types/batch.ts`
- Modify: `src/types/result.ts`
- Modify: `src/types/events.ts`

- [ ] **Step 1: Add JSDoc for batch-layer override semantics**

Add comments like these in `src/types/batch.ts`:

```ts
/** One compiled experiment batch consumed by batch tooling and player packaging. */
export interface BatchConfig { ... }

/**
 * Shared defaults applied across trials unless a trial overrides them locally.
 * This layer exists so compiled batches do not duplicate the same world/stage/output
 * config into every trial JSON blob.
 */
export interface BatchSharedConfig { ... }

/** Per-trial compiled task config after shared defaults are split out. */
export interface BatchTrialConfig { ... }
```

- [ ] **Step 2: Clarify scoring and target semantics in `batch.ts`**

Add or tighten comments on the target/scoring definitions:

```ts
/**
 * Correct answer for analysis.
 * `relative` is canonical because reconstruction correctness is authored as
 * signed action steps from the initial pose stored in x/y/rotation.
 */
export interface ObjectTargetState { ... }

/** Optional world-coordinate analysis target derived from the same authored answer. */
export interface AbsoluteTargetState { ... }

/** Export-facing reference package used by scoring/decoder tools, not by the player runtime. */
export interface ScoringReferenceConfig { ... }
```

- [ ] **Step 3: Add result-layer JSDoc in `result.ts`**

Add comments like these:

```ts
/**
 * Export payload that leaves the browser.
 * It is the bridge format for copy/save, decoder tooling, and downstream analysis.
 */
export interface LayoutTaskResult { ... }

/** Absolute final-state entry in authored world coordinates. */
export interface FinalObjectState extends ObjectPose { ... }

/** Relative final-state entry expressed as signed action steps from the stored origin pose. */
export interface RelativeFinalObjectState { ... }
```

- [ ] **Step 4: Clarify context, flow, and restore fields in `result.ts`**

Add short field comments where meaning is subtle:

```ts
export interface ResultContextObject {
  /** Reconstruction start pose used to interpret relative final states offline. */
  origin: { ... };
  /** Per-step movement size in world units. */
  movement_step: number;
}

export interface ResultFlowInfo {
  /** Timestamp when preview timing actually started, after image readiness/ack gates. */
  preview_started_at?: number;
}

export interface ResultRestoreInfo {
  /** True when this submission continued from autosaved local state. */
  recovered: boolean;
}
```

- [ ] **Step 5: Add event-transport JSDoc in `events.ts`**

Add comments like these:

```ts
/** Compact action vocabulary stored in result events. */
export type LayoutAction = ...

/** Cumulative button-action counts; these are not the same thing as final offsets. */
export interface OperationCounts { ... }

/** Signed displacement from the reconstruction origin in action-step units. */
export interface ObjectOffsets { ... }

/**
 * One participant action record.
 * `blocked_reason` captures why an intended action was rejected, which matters for
 * later analysis of limits, locking, and collision pressure.
 */
export interface LayoutTaskEvent { ... }
```

- [ ] **Step 6: Run focused regression checks**

Run: `npm run test -- src/schemas/batch.schema.test.ts src/schemas/result.schema.test.ts tools/decoder/decoder-utils.test.ts tools/scoring/scoring-utils.test.ts`

Expected:
- PASS for the requested files
- no new failures introduced

- [ ] **Step 7: Commit**

```bash
git add src/types/batch.ts src/types/result.ts src/types/events.ts
git commit -m "docs: comment batch and result types"
```

---

### Task 3: Comment Authoring Schemas

**Files:**
- Modify: `src/schemas/config.schema.ts`

- [ ] **Step 1: Add top-level schema-layer JSDoc**

Add this near the top of `src/schemas/config.schema.ts`:

```ts
/**
 * Authoring-time schema contract for static Layout Task JSON files.
 *
 * These schemas validate what protocol authors may write. They do not describe the
 * fully resolved runtime config after library loading, inferred SVG sizing, and
 * controller defaults have been applied.
 */
```

- [ ] **Step 2: Add JSDoc to the main schema groups**

Add or expand comments for the main semantic groups:

```ts
/** Authoring schema for world coordinates and grid metadata. */
export const worldSchema = ...

/** Authored interaction policy before runtime behavior merging. */
export const behaviorSchema = ...

/** Export/copy policy for saved results; "plain-json" means uncompressed, not encrypted. */
export const outputSchema = ...

/** Reference-image flow modes. Preview flow is a protocol mode, not just UI copy. */
export const flowSchema = ...
```

- [ ] **Step 3: Comment the important `superRefine` invariants**

Insert short rationale comments immediately before or inside these checks:

```ts
// Drag authoring must be explicit in both places so the protocol never lands in a
// half-drag state where movement.mode and free_drag.enabled disagree.
.superRefine((value, context) => { ... })

// Non-SVG assets cannot contribute dimensions from a viewBox, so explicit world-size
// defaults are mandatory at authoring time.
.superRefine((value, context) => { ... })

// Background placement must be all-or-nothing: either the author gives a complete
// world-space placement, or SVG viewBox inference fills all four values later.
.superRefine((value, context) => { ... })
```

- [ ] **Step 4: Add short comments for collision/task object schema boundaries**

Add short comments that prevent layer confusion:

```ts
/** Authored room-level collision declarations; parsed polygons are produced later. */
export const taskCollisionSchema = ...

/** One authored task object before batch/scoring extensions. */
export const taskObjectBaseSchema = ...

/** Final authored standalone task schema. */
export const taskSchema = ...
```

- [ ] **Step 5: Run focused regression checks**

Run: `npm run test -- src/schemas/config.schema.test.ts`

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add src/schemas/config.schema.ts
git commit -m "docs: comment authoring schemas"
```

---

### Task 4: Comment Batch and Result Schemas

**Files:**
- Modify: `src/schemas/batch.schema.ts`
- Modify: `src/schemas/result.schema.ts`

- [ ] **Step 1: Add scoring/batch JSDoc in `batch.schema.ts`**

Add or tighten comments like these:

```ts
/** Canonical authored answer in signed action-step form. */
export const relativeTargetSchema = ...

/** Optional analysis-space world-coordinate target derived from the same authored answer. */
export const absoluteTargetSchema = ...

/** Compiled batch object schema: authored task object plus batch-only role/target/scoring fields. */
export const batchObjectSchema = ...
```

- [ ] **Step 2: Comment batch-level invariants in `batch.schema.ts`**

Add short rationale comments inside or just above `batchSchema.superRefine(...)`:

```ts
// task_id must be unique because compiled tasks are emitted as file-based packages.
// Duplicate ids would overwrite generated artifacts and scramble downstream joins.

// Every trial must resolve a world from either the shared layer or its local override.

// preview_then_reconstruct is invalid without an enabled display image because the
// protocol would otherwise declare a preview phase with nothing to preview.
```

- [ ] **Step 3: Add result-layer JSDoc in `result.schema.ts`**

Add comments like these:

```ts
/**
 * Browser-export result schema.
 * Validation here needs to stay permissive enough for real browser timing/display
 * output while still protecting decoder/scoring tools from impossible shapes.
 */
```

```ts
/** Absolute pose payload stored in authored world coordinates. */
export const objectPoseSchema = ...

/** Signed displacement payload stored in action-step units. */
export const objectOffsetsSchema = ...

/** Exported flow metadata for direct vs preview reconstruction timing analysis. */
export const resultFlowSchema = ...
```

- [ ] **Step 4: Comment key result validation choices**

Add small rationale comments for subtle schema choices:

```ts
// performance.timeOrigin can yield fractional millisecond deltas, so result exports
// must accept finite decimals here rather than forcing integers.

// `collision` is a participant-visible blocked outcome, so it belongs in the stable
// blocked_reason vocabulary alongside lock and limit failures.

// Relative final state is valid output because some export modes intentionally avoid
// writing absolute world coordinates into the payload.
```

- [ ] **Step 5: Run focused regression checks**

Run: `npm run test -- src/schemas/batch.schema.test.ts src/schemas/result.schema.test.ts`

Expected:
- PASS

- [ ] **Step 6: Commit**

```bash
git add src/schemas/batch.schema.ts src/schemas/result.schema.ts
git commit -m "docs: comment batch and result schemas"
```

---

### Task 5: Lightly Comment Protocol-Invariant Schema Tests

**Files:**
- Modify: `src/schemas/config.schema.test.ts`
- Modify: `src/schemas/batch.schema.test.ts`
- Modify: `src/schemas/result.schema.test.ts`

- [ ] **Step 1: Add light invariant comments to `config.schema.test.ts`**

Add only short comments above the most protocol-meaningful cases, for example:

```ts
// Preview flow is not just UI copy; the protocol requires a real reference image.
it("requires display_image for preview flow and rejects invalid preview config", () => { ... })

// SVG object assets may rely on later viewBox inference, but raster assets cannot.
it("requires explicit dimensions for non-SVG object assets", () => { ... })

// Collision declarations are part of the authored protocol surface, even before
// runtime parsing turns them into polygons.
it("accepts object collision polygons and asset outlines", () => { ... })
```

- [ ] **Step 2: Add light invariant comments to `batch.schema.test.ts`**

Add only short comments above the key semantic cases:

```ts
// x/y/rotation store the reconstruction start pose; target.relative stores the answer.
it("treats object x/y/rotation as reconstruction initial pose and target.relative as correct answer", () => { ... })

// Relative-only targets are canonical authored answers; absolute-only is incomplete.
it("accepts relative-only object targets as the canonical answer", () => { ... })

// Shared preview flow still requires each trial to supply a real display image.
it("rejects shared preview flow without trial display_image", () => { ... })
```

- [ ] **Step 3: Add light invariant comments to `result.schema.test.ts`**

Add only short comments above the protocol-boundary cases:

```ts
// Browser timing can contain fractional elapsed milliseconds; rejecting that would
// make valid exports fail decoder/schema validation.
it("accepts fractional elapsed milliseconds from performance.timeOrigin", () => { ... })

// Collision is a stable blocked outcome that downstream tools should understand.
it("accepts collision as a blocked event reason", () => { ... })
```

- [ ] **Step 4: Run focused regression checks**

Run: `npm run test -- src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts src/schemas/result.schema.test.ts`

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts src/schemas/result.schema.test.ts
git commit -m "docs: annotate schema invariants in tests"
```

---

### Task 6: Final Verification in the Isolated Change

**Files:**
- Review all modified files from Tasks 1-5.

- [ ] **Step 1: Scan for noisy comments and placeholders**

Run:

```powershell
rg -n "Increment|Set .* to|TODO|TBD|later|for future" src/types src/protocol src/schemas docs/superpowers/plans/2026-06-22-protocol-spine-commenting.md
```

Expected:
- no newly introduced low-value comments in the touched protocol-spine files
- if matches appear in pre-existing files outside the edited hunks, leave them alone and note them in review

- [ ] **Step 2: Run the touched protocol/schema tests**

Run:

```bash
npm run test -- src/schemas/config.schema.test.ts src/schemas/batch.schema.test.ts src/schemas/result.schema.test.ts tools/decoder/decoder-utils.test.ts tools/scoring/scoring-utils.test.ts
```

Expected:
- PASS

- [ ] **Step 3: Run full test suite and compare against the known baseline**

Run:

```bash
npm run test
```

Expected:
- either full PASS, or
- exactly the same 3 known baseline failures in `src/core/object-collider-svg.test.ts`:
  - `rejects unsupported SVG elements that can hide or reference geometry`
  - `rejects transforms on supported shapes`
  - `rejects transforms on groups`
- no additional failures

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected:
- PASS

- [ ] **Step 5: Commit any final wording-only cleanup**

If a final cleanup commit is needed:

```bash
git add src/types src/protocol src/schemas
git commit -m "docs: refine protocol spine comments"
```

If no cleanup is needed, skip this commit.

---

## Self-Review

- Spec coverage: the plan touches all files named in `docs/superpowers/specs/2026-06-22-protocol-spine-commenting-design.md` and preserves the medium-density rule.
- Placeholder scan: no `TODO`, `TBD`, or incomplete task references remain in the plan.
- Type consistency: the plan uses existing repository names (`target.relative`, `display_image`, `blocked_reason`, `TaskCollisionConfig`, `LayoutTaskResult`) and does not invent missing files such as `src/types/runtime-config.ts`.
