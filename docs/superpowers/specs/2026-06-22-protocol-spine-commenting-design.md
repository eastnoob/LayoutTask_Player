# Protocol Spine Commenting Design

## Goal

Add medium-density comments across the protocol spine so three audiences can read the same source files without guessing:

- protocol/package authors who write or adapt task JSON
- runtime/schema maintainers who validate and resolve those files
- analysis users who interpret result, scoring, and exported state semantics

This pass improves explanation, not behavior.

## Scope

The commenting pass is limited to the protocol spine:

- `src/types/config.ts`
- `src/types/batch.ts`
- `src/types/result.ts`
- `src/types/events.ts`
- `src/protocol/constants.ts`
- `src/schemas/config.schema.ts`
- `src/schemas/batch.schema.ts`
- `src/schemas/result.schema.ts`
- `src/schemas/config.schema.test.ts`
- `src/schemas/batch.schema.test.ts`
- `src/schemas/result.schema.test.ts`

`src/types/runtime-config.ts` is intentionally excluded because it does not exist in the current repository state.

## Audience Model

### 1. Protocol Author

Needs to understand:

- what each exported shape means in authored JSON
- which fields are optional authoring sugar versus required task semantics
- where relative/absolute/initial/target values live

### 2. Runtime / Schema Maintainer

Needs to understand:

- why schemas enforce specific invariants
- where shared vs trial-level overrides are expected
- which exported types represent authoring input versus exported result payloads

### 3. Analysis User

Needs to understand:

- how final state is represented
- why relative target state is canonical
- when absolute values are optional derived analysis values
- how events, offsets, and counts differ semantically

## Commenting Strategy

Use mixed comments with a JSDoc bias:

- exported `type`, `interface`, and schema groups get `/** ... */` comments when the definition needs a stable semantic explanation
- important fields get short inline comments when a reader could otherwise misread the meaning
- internal schema refinements get short rationale comments before the constraint
- tests get only light comments on key cases that guard protocol invariants

Comments stay English-first. Chinese appears only where it sharpens experiment semantics, Rhino/protocol assumptions, or analysis meaning.

## Density Rules

This is a medium-density pass, not a full blanket annotation pass.

### Must Comment

- every exported interface whose semantics are not obvious from its property names alone
- every exported type alias that defines a semantic distinction such as authoring/result/relative/absolute
- every schema block whose validation rule encodes a protocol invariant
- key test cases that exist mainly to protect a protocol rule rather than generic parsing

### May Stay Uncommented

- trivial unions whose meaning is already made explicit by a nearby parent comment
- obvious primitive fields where the name fully explains the value
- repetitive schema leaf nodes when the surrounding object comment already establishes the rule

### Should Not Be Added

- narration of syntax
- comments that simply restate names
- speculative future-feature comments
- broad implementation commentary outside this protocol spine

## File-by-File Design

### `src/types/config.ts`

Focus on authoring semantics.

Add comments that explain:

- authoring-side vs runtime-resolved meaning
- world/grid/stage/display-image semantics
- behavior config intent, especially button/drag/rotation relationships
- flow config semantics for direct vs preview-then-reconstruct
- collision config as authored policy/input, not resolved geometry

Prefer JSDoc on the main exported interfaces and short field comments on ambiguous properties such as `intrinsic_unit`, `viewbox_scale`, `final_state`, and preview flow fields.

### `src/types/batch.ts`

Focus on compiled batch semantics.

Add comments that explain:

- `shared` vs `trial` override layers
- object role / group / target / scoring fields
- relative target state as canonical authored answer
- absolute target state as optional derived analysis target
- scoring reference as an export-facing analysis artifact, not player input

### `src/types/result.ts`

Focus on exported result semantics.

Add comments that explain:

- browser-export payload vs analysis interpretation
- absolute vs relative final state
- context as replay/analysis metadata for interpreting relative results
- flow timing fields and restore fields

### `src/types/events.ts`

Focus on event transport semantics.

Add comments that explain:

- compact event payload intent
- difference between pose, offsets, and operation counts
- blocked reasons as participant-intent outcomes rather than generic errors

### `src/protocol/constants.ts`

Keep this light.

Add a short comment that these arrays are the protocol vocabulary shared across types and schema constraints, not arbitrary UI enums.

### `src/schemas/config.schema.ts`

Focus on authoring-time validation intent.

Add comments that explain:

- this schema validates static authoring JSON rather than fully resolved runtime config
- behavior invariants such as drag mode matching `free_drag.enabled`
- asset sizing requirements and why SVG/non-SVG rules differ
- flow/message/output/data-save sections where protocol meaning is easy to misread
- collision authoring schema as protocol declaration, not parsed runtime polygons

### `src/schemas/batch.schema.ts`

Focus on batch assembly invariants.

Add comments that explain:

- role constants and filename-safe ids as protocol constraints
- target/scoring schemas as analysis-facing protocol
- trial uniqueness and shared-vs-trial world requirements
- preview flow requiring an enabled display image

### `src/schemas/result.schema.ts`

Focus on exported payload validation.

Add comments that explain:

- result schema as browser-output contract
- permissive-but-meaningful numeric validation choices
- event/final-state/context/flow sections and what downstream tools assume

### Schema Tests

Add only light comments.

Use comments where a case is primarily guarding a protocol rule, for example:

- shared/trial override requirements
- preview flow prerequisites
- canonical relative target semantics
- result-mode validation boundaries

Do not comment every test.

## Non-Goals

- no full-repo commenting sweep
- no runtime behavior changes
- no file moves or refactors
- no expansion into unrelated core/controller/renderer files in this pass

## Verification

After the commenting pass:

- run targeted schema/type-adjacent tests if touched
- run full `npm run test`
- run `npm run build`
- review for noisy or redundant comments before claiming completion

## Risks and Mitigations

### Risk: Over-commenting

Mitigation: medium-density rule, JSDoc on semantic boundaries, light inline comments elsewhere.

### Risk: Mixing authoring/runtime/analysis semantics

Mitigation: explicitly name the layer in top comments for each file and on ambiguous types such as batch target state and result final state.

### Risk: Test files becoming prose dumps

Mitigation: comment only invariant-guarding cases, not generic happy-path coverage.
