# Persistent Reference Experiment Condition Design

**Date:** 2026-09-24  
**Status:** Design draft; implementation pending spec review  
**Branch:** `persistent-reference-condition`

## Goal

Add a compile-time experiment condition in which the perspective reference image remains visible above the floor-plan workspace throughout every tutorial and formal trial, while preserving the existing 10-second preview condition as a separate, reproducible condition.

## Research distinction

The existing condition measures reconstruction after a limited observation and therefore combines visual extraction, short-term memory, and floor-plan reconstruction. The new condition measures how much layout information can be used from the perspective image when it remains available as a fixed reference. The two conditions must be identifiable in exported data and must not overwrite each other's packages.

## Condition model

Add one explicit configuration value:

```ts
type ReferenceMode = "preview_10s" | "persistent";
```

Behavior:

| Mode | Perspective image | Preview timer | Tutorial wording | Release package |
| --- | --- | --- | --- | --- |
| `preview_10s` | shown during preview, then hidden | enabled | memory/reconstruction instructions | existing preview package |
| `persistent` | fixed reference remains visible above workspace | disabled | persistent-reference instructions | separate persistent package |

The default remains `preview_10s` so existing experiments do not silently change.

## Scope of the persistent condition

The condition applies consistently to:

- all four tutorial reference-board pages where applicable;
- the fixed interactive tutorial;
- all 23 formal R12 scenes;
- the tutorial completion transition;
- exported result metadata.

The same task coordinates, furniture assets, collision assets, scoring references, and formal trial order are reused. This condition changes presentation and measurement metadata, not the stimulus geometry.

## User interface behavior

### Persistent reference image

- Keep the perspective image visible in a fixed panel above the floor-plan workspace.
- Do not show the 10-second preview countdown or `Start preview` gate.
- Keep the image at a stable, configured display size.
- Do not let the floor-plan viewport transform resize or pan the perspective reference image.
- Preserve the existing floor-plan zoom and right-drag pan controls only if they are scoped to the floor-plan workspace and cannot enlarge the reference image.

### Prohibited reference-image assistance

The persistent tutorial and formal task instructions must say:

> You may refer to the perspective image at any time. Do not enlarge the perspective reference image using browser zoom, Ctrl + scroll, or any magnification tool. These actions may be recorded, and trials using prohibited visual assistance may be excluded from the study and may affect compensation eligibility. Incorrect answers alone do not cause exclusion; please answer honestly and make your best judgment.

If floor-plan zoom controls remain enabled, add:

> You may use the controls for viewing the floor-plan workspace. These controls do not enlarge the perspective reference image.

The wording must not claim that an action is detected unless the implementation records it. Detection/recording is defined below.

## Assistance-event recording

For `persistent` mode, record an explicit display-assistance record in the rich result:

```ts
interface ReferenceAssistanceInfo {
  mode: "persistent";
  reference_image_visible: true;
  reference_image_zoom_attempts: number;
  browser_zoom_observations: Array<{
    t: number;
    scale?: number;
    viewport_width: number;
    viewport_height: number;
  }>;
  prohibited_events: Array<{
    t: number;
    type: "ctrl_wheel" | "reference_image_pointer_zoom" | "browser_zoom_change";
    handled: boolean;
  }>;
}
```

The implementation must distinguish:

- browser/page zoom or `Ctrl + wheel` affecting the reference image;
- allowed floor-plan zoom controls;
- ordinary window resize, orientation changes, and device pixel ratio changes.

If reliable browser-zoom detection is not available in a browser, record the observable viewport/scale change and mark the event as an observation rather than claiming certainty. Do not falsely classify ordinary resize events as prohibited zoom.

## Tutorial behavior

The persistent tutorial must:

- omit the 10-second study gate;
- keep the perspective image visible while the participant reconstructs the scene;
- explain that the reference image can be checked at any time;
- explain the reference-image zoom restriction;
- retain the existing instructions about yellow movable objects, confidence selection, saving, collisions, and honest responses;
- retain the `Tutorial complete.` transition page before formal trials.

The `preview_10s` tutorial remains unchanged and must retain its time-limited wording.

## Compiler and package behavior

Compilation accepts `reference_mode` and creates distinct output packages:

```text
preview_10s -> public/layout-task-run12-core23-preview/
persistent   -> public/layout-task-run12-core23-persistent/
```

The persistent package must contain:

- the same 23 formal task configs and scoring references;
- the fixed tutorial release copy under `tutorial/`;
- all reference-board assets;
- the persistent experiment configuration;
- a package/integrity version identifying `reference_mode=persistent`.

The fixed source tutorial remains `public/layout-task-tutorial/`. Compilation may copy it into the persistent release package after lock verification, but must never modify the source package. The existing preview package must remain byte-for-byte unaffected by persistent compilation.

## Result data

Every rich result and exported session/debug file must identify the condition:

```json
{
  "reference_mode": "persistent"
}
```

The persistent result must also include the assistance record when recording is enabled. Existing fields remain available:

- browser user agent;
- viewport and screen dimensions;
- browser visual viewport scale;
- device pixel ratio;
- rendered stage and reference-image dimensions;
- display changes;
- action/event timeline;
- final furniture state and confidence.

The CSV output must preserve the existing `trial_type=tutorial|formal` classification and add `reference_mode` to session/debug metadata and trial-bearing rows where the schema permits. Formal trial count remains 23; tutorial data remains classified as `tutorial`.

## Non-goals

- Do not delete or alter `preview_10s`.
- Do not change task coordinates, furniture rotations, collision geometry, or scoring targets.
- Do not make persistent mode the default.
- Do not treat floor-plan zoom as prohibited unless it enlarges the perspective reference image.
- Do not claim perfect detection of browser actions that the browser does not expose reliably.
- Do not use correctness alone as a quality-exclusion rule.

## Verification strategy

### Configuration and timeline

- schema accepts `preview_10s` and `persistent`;
- absent mode defaults to `preview_10s`;
- persistent timeline has no preview countdown or `Start preview` gate;
- persistent timeline keeps the reference image visible and formal trials in the same order;
- preview timeline remains unchanged.

### Tutorial copy

- persistent tutorial includes the reference-image availability and zoom restriction wording;
- persistent tutorial distinguishes allowed floor-plan controls from prohibited reference-image enlargement;
- preview tutorial retains the 10-second memory wording;
- both conditions retain the tutorial completion page.

### Assistance recording

- Ctrl-wheel attempts and observable browser zoom changes are recorded when detectable;
- ordinary resize/orientation changes are not classified as prohibited zoom;
- floor-plan zoom controls do not create reference-image assistance violations;
- result schema remains valid when no prohibited event occurs.

### Package isolation

- persistent compilation creates `layout-task-run12-core23-persistent/`;
- preview package is unchanged;
- persistent package contains a self-contained tutorial release copy;
- removing the sibling source tutorial after compilation does not break the persistent package;
- persistent package lock identifies the condition.

### Data flow

- rich JSON contains `reference_mode` and assistance data;
- tutorial and formal CSV rows retain `trial_type`;
- formal count remains 23;
- copy, DataPipe, receiver, and recovery output preserve the condition and assistance fields.

## Grill-me self-review

### Challenge 1: Is this a new product branch or a runtime condition?

**Resolution:** Use the new branch for isolated implementation, but implement `reference_mode` as a compile-time condition. This permits controlled comparison and avoids duplicating renderer/runner logic.

### Challenge 2: Could persistent mode silently change the existing experiment?

**Resolution:** Default to `preview_10s`, generate a separate persistent package, and add a regression test that the preview package/config remains unchanged.

### Challenge 3: Could floor-plan zoom be incorrectly prohibited?

**Resolution:** Scope the reference image to its own stable panel and record only reference-image/browser zoom signals. State explicitly that floor-plan controls are separate.

### Challenge 4: Could the instructions promise detection that is not technically reliable?

**Resolution:** Use “may be recorded” in participant-facing copy and record observable signals with event certainty. Never label ordinary resize as a violation.

### Challenge 5: Could the persistent condition accidentally remove the tutorial completion gate?

**Resolution:** Remove only the 10-second preview gate; retain the tutorial interaction and `Tutorial complete.` transition before formal trials.

### Challenge 6: Could result analysis confuse the two conditions?

**Resolution:** Add `reference_mode` to rich results, session/debug metadata, and trial-bearing export rows while retaining `trial_type` for tutorial/formal separation.

