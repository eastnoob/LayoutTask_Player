# Chinese Completion-Code Gate Design

**Date:** 2026-09-25  
**Status:** Design specification; implementation requires a reviewed workplan.  
**Scope:** Locale-specific participant copy, completion-code collection, 15-second gate, final data persistence, and upload ordering.

## 1. Goal

Add an independent Chinese compilation mode. In that mode only, show a required completion-code page immediately before the existing final data-save/upload flow. The participant may enter the code supplied by the external questionnaire/system; the Player stores the entered value as opaque text and never generates, interprets, or validates its format.

## 2. Configuration

Add an experiment-level locale and completion-code gate configuration:

```json
{
  "locale": "zh-CN",
  "completion_code_gate": {
    "enabled": true,
    "min_display_ms": 15000
  }
}
```

English or other modes can disable the page:

```json
{
  "locale": "en-US",
  "completion_code_gate": {
    "enabled": false
  }
}
```

The compiler must preserve the configuration in the runtime package. The runner must branch only on this explicit configuration, not on a hard-coded experiment ID.

## 3. Chinese Participant Copy

When `locale` is `zh-CN`, participant-facing experiment copy is Chinese, including the completion-code page. The completion-code page must contain this exact text, with no deletion:

```text
请在下方填写完成码并截图保存本页。以便发布者审核数据与发放报酬(202609259125)。
```

The phrase `填写完成码并截图保存本页` must be rendered bold and red. The surrounding text and `(202609259125)` remain ordinary text. The number is fixed questionnaire copy, not a completion-code value and not a value to validate.

The page must also tell the participant that the code comes from the external questionnaire/system and should be pasted exactly as received. This supporting explanation is Chinese and must not claim that the Player can verify the code.

## 4. Completion-Code Page Behavior

The page appears only when both conditions hold:

1. `config.locale === "zh-CN"`;
2. `config.completion_code_gate.enabled === true`.

It appears after the final formal trial has completed and before final CSV/JSON construction and any DataPipe submission. The page contains:

- a required text input with an accessible label;
- a `Continue` button initially disabled;
- a visible 15-second countdown;
- the exact red/bold instruction phrase described above.

The button becomes enabled only when both conditions hold:

```text
elapsed_display_ms >= 15000
AND input.trim().length > 0
```

The input may contain any non-empty text. Do not trim or normalize the stored value; use trimming only to decide whether the required field is empty. If the participant edits the field after 15 seconds, the button must immediately disable again when the field becomes empty and re-enable when it becomes non-empty.

When `Continue` is clicked, freeze the accepted `completion_code` value, remove the gate page, and begin the existing final save/upload flow. Do not upload before this page is completed.

## 5. Data Contract

Add one opaque field:

```text
completion_code
```

The field is required in the in-memory final result for Chinese mode and contains the exact participant-entered string. For non-Chinese mode, preserve schema compatibility by emitting an empty string or the existing optional representation chosen by the current result contract; do not invent a code.

The value must be included consistently with the same `participant_id`, `session_id`, and `experiment_id` in:

- session CSV;
- formal results CSV/JSON;
- raw result JSON;
- tutorial/result summary where those files carry session-level metadata;
- IndexedDB local backups;
- recovery ZIP manifest and files;
- DataPipe JSON envelope and submitted files.

The receiver must treat it as opaque data. It must not use the value as a filesystem path, SQL fragment, routing key, or authorization token.

## 6. Save and Failure Ordering

The Chinese flow is:

```text
final formal trial
-> completion-code gate
-> required non-empty input + 15-second wait
-> build complete output files with completion_code
-> persist local backups
-> upload each file/DataPipe submission
-> archive the session
-> render the existing final success/failure page
```

If upload or archive fails, the existing recovery behavior remains active. Recovery files must still contain the entered completion code and the same participant/session identifiers. The completion-code page must not be shown again merely because upload failed.

## 7. Locale Scope

The configuration establishes a reusable locale branch rather than a one-off completion-code special case. This change must not silently translate formal packages configured as English. The first supported locale is `zh-CN`; unsupported locale values must fail configuration validation or use the existing documented default, never partially translate a page.

The external questionnaire platform is outside this repository. Its page split, required-answer setting, copy/paste permission, and 15-second stay rule must be configured separately using the exact platform manual. This Player feature only supplies and records the entered value.

## 8. Tests

Add tests for:

- schema acceptance/rejection of `locale` and `completion_code_gate`;
- Chinese mode inserting the gate before final save;
- English mode omitting the gate;
- exact Chinese copy and the red/bold phrase;
- Continue disabled before 15 seconds;
- Continue disabled after 15 seconds when the input is empty;
- Continue enabled after 15 seconds with any non-empty text;
- clearing the input disabling Continue again;
- preserving whitespace inside the stored value while using trim only for emptiness;
- completion code reaching every output builder and DataPipe envelope;
- no upload request before Continue;
- upload failure retaining the code in local recovery output;
- tutorial/formal data and participant/session identifiers remaining unchanged.

Add browser smoke coverage for:

1. Chinese mode reaches the gate after the final trial.
2. The red/bold phrase is visible and the fixed number remains ordinary text.
3. The button remains disabled for 15 seconds.
4. A participant enters a code, continues, and the code appears in the generated payload.
5. English mode reaches the existing save flow without the gate.

## 9. Acceptance Criteria

The feature is complete when a Chinese-configured build shows the exact required completion-code page, visually emphasizes only `填写完成码并截图保存本页` in bold red, requires a non-empty entry and 15 seconds before continuing, persists the opaque value through all local/network outputs before upload, and leaves non-Chinese builds unchanged.
