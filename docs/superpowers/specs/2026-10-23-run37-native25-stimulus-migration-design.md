# Run 37 Native-25 Stimulus Migration Design

**Status:** Approved for implementation on a new branch; local preview approval remains required before release.

**Goal:** Replace the participant-facing formal stimulus pool with the 25 unique selections from `E:/260917/sample/run_37/native_25` while preserving the current Player behavior, tutorial, scoring semantics, archive protocol, and rollback path.

## Scope

### In scope

- Generate a new 25-task formal runtime package from the selected Run 37 rows.
- Copy the corresponding perspective images and all referenced task assets into the new package.
- Generate a new scoring reference from the protocol-authored object targets in the source CSV.
- Replace the old 23-task plus two-repeat presentation schedule with a 25-task no-repeat schedule.
- Publish bilingual formal experiment configuration that points to the new package and the receiver.
- Update VPS assignment configuration to the new experiment ID, schedule version, and sequence IDs.
- Keep the current tutorial package and all current Player behavior unchanged.
- Produce a fresh self-contained static release package with no unreferenced old formal scenes.

### Out of scope

- Rewriting the renderer, tutorial, red-glow behavior, magnifier, Pause flow, confidence UI, collision model, or archive implementation.
- Changing the compensation rules, participant-facing wording, or the tutorial reference board.
- Deleting the old static release, old source package, old scoring reference, old schedule, or historical receiver data.
- Clearing or renumbering existing VPS assignments.
- Changing the receiver database schema or archive destinations.

## Baseline Facts

- Current formal package: `public/layout-task-run12-core23-persistent`.
- Current formal design: 23 unique tasks plus two repeated presentations, for 25 presentations.
- Current tutorial package is separately locked and must be copied unchanged.
- Earlier source review reported 25 unique combinations, 25 unique image hashes, 25 selected rows, and 100 furniture records; these claims require revalidation from the original inputs before package generation.
- Earlier source review reported matching source and review image hashes for all 25 rows; this must be revalidated in the current environment.
- The current static release must not be treated as the new source of truth: its participant-facing entry was previously observed using local-review/copy configuration. The new release must explicitly use formal receiver configuration.
- The existing schedule generator balances positions but does not currently satisfy the intended all-ordered-adjacency balance; this is an order-layer defect to resolve before generating the new schedule.

## Version Isolation

The migration uses new identities so old results cannot be interpreted with new targets:

| Artifact | Proposed value |
|---|---|
| Experiment ID | `run_37_native25_persistent` |
| Formal package | `layout-task-run37-native25-persistent` |
| Schedule version | `run37-native25-williams-v1` |
| Scoring reference version | `run37-native25-scoring-v1` |
| Filename prefix | `run-37-native25-persistent` |
| Sequence IDs | `1` through `50` |

These names are provisional until implementation starts; changing them must be a deliberate version change, not an incidental rename.

## Data Flow

```text
run_37/native_25/selected.csv
        + row_index
        v
E:/260917/data.csv  (read-only source of protocol JSON and targets)
        v
run37-native25 source batch
        v
compileBatch(reference_mode=persistent)
        + tasks
        + scoring/scoring-reference.json
        + schedule.json
        v
new bilingual experiment configs
        v
fresh static release staging directories
        v
static repository + VPS assignment configuration
```

The selector CSV is only the selection manifest. It must not be used as the answer table by itself. The canonical object targets come from each selected row's protocol JSON in `E:/260917/data.csv`.

## Runtime Package Contract

The new package must satisfy all of the following:

1. It contains exactly 25 formal task IDs and no tutorial task in the formal manifest.
2. Each formal task has one display image, its background, its object assets, its behavior references, and any required collision assets.
3. Each task preserves the current four-editable-object contract and current object roles/groups unless the source protocol explicitly differs.
4. Each scorable object has a canonical relative target. Any absolute target is derived metadata and cannot replace the relative target.
5. The package uses `reference_mode: "persistent"`.
6. The tutorial package is copied from the currently verified package and passes its existing lock verification.
7. The package contains no filesystem-dependent source paths and no nested `dist` directory.
8. Every declared asset reference resolves inside the package, including icons, task images, SVGs, animations, backgrounds, collision files, and tutorial files.

## Schedule Contract

The new formal schedule has 25 unique tasks and no repeats:

- `uniqueSceneCount = 25`.
- `presentationCount = 25`.
- `repeatGroups = []`.
- Every presentation has `repeatGroupId = null`, `repeatIndex = 0`, and `repeatOfTaskId = null`.
- The schedule contains 50 deterministic sequences, numbered `1` through `50`, so each task occurs twice at each trial position across the complete matrix.
- Each sequence contains all 25 task IDs exactly once.
- The intended first-order check is explicit: each ordered pair of distinct tasks appears exactly twice as adjacent presentations across the complete 50-sequence matrix. If the project elects not to require this statistical property, that decision must be recorded before implementation; it must not silently inherit the current generator's weaker behavior.
- `trialTotal` is 25 for every presentation.

The receiver's `ASSIGNMENT_SEQUENCE_IDS` must exactly match the published ordered list `1,2,...,50`. The frontend remains responsible for loading the assigned sequence; the receiver remains the authority for participant number and sequence assignment.

## Bilingual Experiment Configuration

Create separate Run 37 Chinese and English configurations first. Each must contain:

- the new experiment ID;
- the new persistent package base URL;
- the new schedule path and schedule version;
- the unchanged tutorial configuration and tutorial package version;
- the unchanged confidence scale and reward values;
- `data_save.mode = "receiver"`;
- the production receiver endpoint and the new experiment ID in `data_save`;
- exactly 25 formal trial entries matching the new manifest;
- the correct locale.

Only after local acceptance should the release entry point be switched to these formal configurations. Local review configurations remain available for development and must not be published as the participant-facing default.

## Cleanup Rules

Cleanup is performed only in the new release staging directory:

- Copy only files reachable from the new manifest, experiment configs, schedule, scoring reference, tutorial lock, and public UI asset references.
- Do not delete files from the source repository or from the old formal package during this migration.
- Do not remove a file merely because its name resembles an old scene; remove it only after recursive reference validation proves it is not needed by the new release.
- Preserve a manifest of the staged file list and hashes so the release can be audited and reproduced.

## VPS Cutover

The VPS change is configuration-only:

1. Keep the current data volume, SQLite database, JSONL index, archive targets, and retry mechanism.
2. Set `ASSIGNMENT_EXPERIMENT_ID=run_37_native25_persistent`.
3. Set `ASSIGNMENT_SCHEDULE_VERSION=run37-native25-williams-v1`.
4. Set `ASSIGNMENT_SEQUENCE_IDS=1,2,...,50` in schedule order.
5. Keep existing archive destinations and token/origin controls.
6. Verify `/health` and `/assign` with a fresh idempotency token before public cutover.
7. Verify that the returned assignment uses the new experiment and schedule version.
8. Do not alter or delete old assignment rows. Rollback is performed by restoring the previous environment values and static release.

The exact VPS host and deployment command will be taken from the existing deployment procedure at implementation time; no guessed access method is part of this spec.

## Verification Gates

### Gate A: Source and dependency integrity

- Confirm the 25 selected row IDs, combination IDs, image hashes, and source paths.
- Confirm every selected row exists exactly once in `E:/260917/data.csv`.
- Confirm the original source CSV, old package, tutorial package, and old release references are unchanged.
- Write a migration input manifest with source hashes.

### Gate B: New package correctness

- Validate source batch schema.
- Compile the new package with persistent reference mode.
- Validate manifest, task files, scoring reference, target presence, collisions, and all asset references.
- Validate exactly 25 formal tasks and 100 expected furniture records at the source-selection layer.
- Validate the schedule contract, including the ordered-pair test.
- Validate Chinese and English configs against the same task and schedule IDs.

### Gate C: Browser behavior

- Run the current full unit test suite.
- Build from a clean output directory.
- Run Chromium and WebKit local flows in both locales.
- Confirm the image remains above the floor plan and no formal preview countdown appears.
- Confirm existing tutorial and interaction behavior remains unchanged.
- Confirm the 25 formal tasks load in the assigned order, allow editing, save confidence, submit, and retain the new assignment metadata.
- Confirm no browser request returns 404 or a failed declared asset request.

### Gate D: User acceptance

- Start both local bilingual formal previews.
- Show the user the first tasks and the package identity.
- Wait for explicit approval before publishing or touching VPS configuration.

### Gate E: Release and VPS

- Publish from a fresh staging copy, never by incrementally modifying the old static checkout.
- Verify remote branch hashes, entry config, package file count, manifest hash, and `persistent` mode.
- Update VPS assignment configuration.
- Run a controlled `/assign` request and verify the returned version fields.
- Run a controlled submission/validation check without mixing it into historical data.

## Rollback

Rollback is limited to switching the static entry and VPS assignment environment back to the old release values. Because the new experiment ID and schedule version are isolated, no historical submission needs to be rewritten. New Run 37 data is not interpreted using the old scoring reference.

## Acceptance Criteria

The migration is accepted only when:

- the old release and old data remain recoverable;
- the new package contains exactly 25 unique formal tasks;
- all 25 image/task/answer mappings pass integrity checks;
- the new 50-sequence matrix passes its declared balance checks;
- both locales load the same task IDs and schedule version;
- formal saving uses the receiver rather than local copy mode;
- the VPS returns only the new experiment/schedule for new assignment requests;
- static package asset checks and browser smoke tests pass;
- the user has approved the local bilingual preview.

## Known Risks

- The selected CSV is not itself the canonical answer table; row-index extraction from the large source CSV must be exact.
- Existing schedule generation does not satisfy the intended ordered-adjacency property and must be covered by a failing test before changing it.
- Existing source and release branches contain untracked user files; implementation must avoid staging or deleting them.
- The VPS currently contains historical assignments; changing configuration without a new experiment ID would mix cohorts, so version isolation is mandatory.
