# Pre-study Consent and Participant Profile Design

## Goal

Present the complete informed-consent and data-protection text as scrollable web content, remove only the paper-entry blanks, collect age and corrective-eyewear use before the tutorial, and preserve these values through every existing export path.

## Requirements

1. The consent page presents both supplied documents in full, in the selected locale.
2. Paper-only entry lines and signature lines are omitted from the web rendering. The surrounding explanatory text remains.
3. The five existing confirmation checkboxes remain required.
4. The consent button states that clicking it after all confirmations is electronic consent and signature for both documents.
5. After consent and before the tutorial, show the existing “This is an experiment, not a test” page with:
   - a corrective-eyewear notice;
   - a prominent warning not to zoom, minimise the browser, or refresh;
   - the existing pause-limit explanation;
   - required age input;
   - an unchecked-by-default checkbox for daily corrective-eyewear use.
6. The participant profile is collected before tutorial entry but after consent. Formal participant/session identity generation remains in the existing bootstrap order.
7. Age and corrective-eyewear use are included in session metadata, CSV, JSON, IndexedDB/recovery data, and DataPipe payload contents through the existing shared export paths.
8. English, Chinese, and developer modes use the same flow with localized copy. Existing Prolific ID, assignment, pause, reward, and upload behavior remains compatible.

## Data Contract

Use stable fields:

- `participant_age: number`
- `requires_corrective_eyewear: boolean`

The profile is part of the consent/start metadata and is copied into every final export envelope where consent metadata is already present.

## Out of Scope

- Do not edit the source PDFs.
- Do not collect paper-form names, dates, addresses, or signatures as inputs.
- Do not create a new participant-number system.
- Do not change unrelated experiment assets or scoring.
