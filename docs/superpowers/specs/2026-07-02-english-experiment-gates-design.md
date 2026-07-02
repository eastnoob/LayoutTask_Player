# English Experiment Gates Design

## Goal

Tighten the participant-facing experiment flow before wider GitHub Pages use:

- A participant cannot leave a furniture group edit session without choosing confidence.
- After the tutorial trial, the participant sees an explicit English transition page before formal trials.
- All participant-visible demo experiment text is English.

## Current Context

The experiment runner already supports a tutorial trial followed by fixed-order formal trials. Confidence is already tracked per furniture group through `ConfidenceController`, and `InteractionController` already blocks deselecting or switching groups when confidence is required but missing. The missing pieces are English copy, a visible transition page after the tutorial, and verification that the existing confidence gate presents the right participant-facing message.

## Design

### Confidence Exit Gate

Keep the existing confidence controller and interaction gate. When a participant clicks the stage background or tries to switch groups without choosing confidence for the active furniture group, the edit session stays active, the confidence control receives focus, and the status text says:

`Choose a confidence rating for this furniture group before exiting edit mode.`

Switching to another object can use the same sentence. We do not add a modal because the always-visible confidence panel is the action target and avoids interrupting the editing flow.

### Tutorial-To-Formal Transition

Insert one `@jspsych/plugin-instructions` trial immediately after the tutorial trial and before the first formal LayoutTask trial. The page text is English:

`Tutorial complete.`

`The formal experiment must be completed in one sitting. Do not refresh, close, or leave this page temporarily, otherwise you may be unable to receive the required compensation.`

The button text is:

`Start formal experiment`

This stays inside the jsPsych timeline; no new route or custom page component is needed.

### English-Only Participant UI

Update participant-visible text in the current demo package and shared controls to English. This includes tutorial bubbles, confidence labels/title/status, flow messages in demo task JSON, final experiment text, and the existing end page. Code comments and internal test names may remain as they are because participants do not see them.

## Testing

- Interaction controller test: deselecting without active confidence keeps edit mode and emits the English confidence prompt.
- Experiment runner test: tutorial-enabled timeline inserts the formal-start instructions page between tutorial and formal trials.
- Text smoke check: scan participant-facing demo files for known Chinese UI strings after replacement.
- Regression: run `pixi run test`, `pixi run build`, and validate/open the GitHub Pages experiment flow after deployment.

## Scope Notes

No i18n framework is added. The demo experiment is English-only for now; if future studies need multiple languages, language selection can be added as a separate feature.
