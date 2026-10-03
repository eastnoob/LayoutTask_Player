# Scoring Equivalence and Pause Visibility Design

## Goal

Fix two participant-visible experiment defects without embedding furniture-specific
rules in the runtime:

1. Some authored rotation answers can declare equivalent rotation-step values. The
   R12 M05 sofa/coffee-table object will declare `-2` and `2` as an equivalent pair.
2. The Pause control remains hidden during instruction/reference/loading transitions
   and appears only after a Layout Task trial has mounted its interactive surface.

## Design

### Data-driven rotation equivalence

Add an optional object-level scoring field:

```json
{
  "equivalence_classes": {
    "rotation_steps": [[-2, 2]]
  }
}
```

Each inner array is an equivalence class. Exact equality remains the default. A
value matches a target when the values are exactly equal or both occur in the same
declared class. The scoring engine does not inspect asset names, object IDs, or
furniture model names. The batch compiler copies this metadata into the private
scoring reference, and runtime reward scoring plus offline scoring use the same
generic helper.

The R12 source batch annotates the M05 variable object with the equivalence class;
the generated compiled, preview, persistent, and release scoring references then
carry the declaration. Other objects receive no equivalence metadata.

### Pause lifecycle

The experiment runner hides the Pause UI at the start of every jsPsych trial. The
Layout Task plugin receives an internal `onReady` callback and invokes it only after
its config has loaded and `player.start()` has mounted the real interactive task.
The runner uses that callback to activate Pause. Instruction pages, the four
reference-board pages, the tutorial-complete page, inter-trial loading, and failed
task loading therefore remain hidden. Tutorial and formal Layout Task pages keep
their existing separate pause controllers and behavior.

This is a lifecycle boundary, not a timer or DOM polling workaround. If task
loading fails, the callback is never called and Pause remains hidden while the
existing error path reports the failure.

## Compatibility

- Existing scoring references without `equivalence_classes` retain exact matching.
- Existing result payloads are unchanged; equivalence metadata is reference-side
  scoring input and is not copied into participant answers.
- `preview_10s`, persistent reference mode, tutorial source assets, DataPipe, local
  backup, and formal trial count remain unchanged.
- English and Chinese packages receive the same behavioral fix; only their existing
  locale configuration differs.

## Acceptance criteria

- A reference target of `2` accepts answer `-2` only when the object declares the
  `[-2, 2]` class.
- The same answer remains incorrect for an object without that declaration.
- M05 annotations survive batch compilation into every R12 scoring reference.
- Pause is hidden on intro/reference/tutorial-complete/loading pages and visible
  after the tutorial practice and formal task surfaces mount.
- Focused tests, the full test suite, build, package validation, and both release
  package checks pass.
