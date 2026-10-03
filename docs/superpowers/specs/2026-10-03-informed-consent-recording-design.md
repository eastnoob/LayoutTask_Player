# Informed Consent Recording Design

## Goal

Replace the short welcome notice with a bilingual, participant-facing HTML informed-consent page that records four explicit confirmations and carries the resulting consent record through the existing experiment exports and DataPipe upload.

## Scope

This change covers the consent UI, consent state, and consent metadata in existing export paths. It does not redesign or alter the separate raw-data cleaning/deletion process. It does not modify task assets, tutorial assets, formal trial data, scoring, reward calculation, pause behavior, or DataPipe transport semantics.

## Participant-facing requirements

The page must be shown before Prolific ID collection, participant-number generation, sequence assignment, and any DataPipe request.

The page must state the current study facts rather than copying inconsistent pilot/template values:

- The study reconstructs furniture layouts from indoor photographs and floor plans.
- The study takes approximately 20–40 minutes.
- Compensation is the configured £4 base payment plus configured task-performance bonuses.
- The current data flow collects Prolific ID, participant/session information, position and rotation responses, confidence ratings, reaction times, and task-operation records.
- Data is stored using the university-provided WebDAV/research storage and the configured university research pipeline.
- The existing separate data-cleaning process remains authoritative for raw-data deletion and cleaned-data retention; this feature must not rewrite that policy text or implementation.

The page must contain four required, individually checkable confirmations corresponding to the consent form:

1. The participant confirms that they volunteered to participate.
2. The participant confirms that they were allowed to ask questions and received responses.
3. The participant confirms that the document was presented before the study began.
4. The participant confirms that they understood their right to quit at any time.

The page must explain that checking the confirmations and selecting the consent button constitutes the participant's electronic confirmation/signature for this study. It must not claim to create a handwritten signature.

The consent button stays disabled until all four boxes are checked. Selecting it records the consent immediately and advances to the existing Prolific ID page. The Konami developer route remains available on the consent page, but developer mode must also record the same consent record with a developer marker.

English and Chinese must have equivalent meaning and the same four confirmation fields. The exact storage keys are language-neutral.

## Consent record contract

Define a serializable record with these fields:

- `consent_version`: stable version string for this notice.
- `notice_version`: stable version string for the data-protection notice shown with it.
- `locale`: `en-US` or `zh-CN`.
- `consented_at`: ISO timestamp captured when the button is accepted.
- `signature_method`: `checkbox_confirmation`.
- `voluntary_participation_confirmed`: boolean.
- `questions_answered_confirmed`: boolean.
- `prestudy_document_confirmed`: boolean.
- `withdrawal_right_understood_confirmed`: boolean.
- `developer_mode`: boolean.

All four booleans must be `true` for a successful consent result. The record is created only after the participant activates the consent button; before that point no record is persisted or uploaded.

## Data flow

- `main.ts` obtains the consent record before requesting Prolific ID or assignment.
- `createRunnableExperiment()` receives the record and passes it to export generation.
- The session CSV adds the consent fields as session-level columns.
- The debug JSON and tutorial-result JSON include the full consent record.
- Existing results/events/rewards CSV files remain structurally compatible; they may receive the stable consent version/locale fields only if the existing export helper already carries session metadata, but no existing cleaning fields are renamed or removed.
- Recovery ZIP uses the same generated files, so it automatically retains the consent record.
- DataPipe uploads the same generated files through the existing path; no extra request is made for consent.

## Invariants

- No participant number, sequence assignment, Prolific ID prompt, or DataPipe request before consent.
- No consent record with a false confirmation may be accepted.
- Existing English behavior outside the expanded notice remains unchanged.
- Existing Chinese developer mode remains available and is fully recorded.
- Existing raw-data cleaning/deletion implementation and wording remain untouched.

## Testing and verification

- Unit tests prove the four-checkbox gate, exact bilingual confirmation meaning, electronic-signature metadata, and pre-consent blocking.
- Data-export tests prove consent metadata appears in session CSV, debug JSON, tutorial result, and DataPipe payload files.
- Full `npm test -- --run`, `npm run build`, and `git diff --check` must pass.
- Browser smoke tests cover English and Chinese consent pages, disabled/enabled button behavior, developer mode, no pre-consent assignment, and final uploaded payload presence.
