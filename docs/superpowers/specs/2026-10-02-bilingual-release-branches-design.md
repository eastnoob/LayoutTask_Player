# Bilingual Release Branches Design

**Goal:** Publish the current fully featured experiment as two stable branches, `release/zh-CN` and `release/en-US`, with identical behavior, assets, schedules, saving, and tutorial flow, differing only in user-facing language and locale configuration.

## Scope

- The current committed feature set is the source of truth, including staged tutorial viewing guidance, reward metadata, pause behavior, completion-code behavior, DataPipe saving, the 23 updated perspective images, and the persistent R12 package.
- The Chinese branch keeps `locale: "zh-CN"`, Chinese completion-code behavior, Chinese participant-facing copy, and the current Chinese deployment entry.
- The English branch uses `locale: "en-US"`, English participant-facing copy, and an English deployment entry.
- Both branches use the same 23 formal scenes, 25 presentations, 46 schedules, 92 variable objects, tutorial package, scoring reference, and DataPipe endpoint.
- The two branches live in the existing repository. No new worktree or repository is required.

## Branches and Configurations

- `release/zh-CN` is created from the current feature commit and contains the production Chinese configuration at `public/experiment/experiment-zh.json`.
- `release/en-US` is created from the same source commit and contains `public/experiment/experiment-en.json` plus an English debug configuration when needed.
- The root deployment entry on each branch points to that branch's language configuration.
- Debug configurations retain participant 9999 behavior and the developer shortcut. Production configurations retain ordinary participant assignment and DataPipe saving.

## Localization Boundary

All participant-facing text must resolve from the existing locale-aware message and runner paths. The English branch must not inherit Chinese strings from shared defaults. This includes consent, tutorial introduction, reference-board controls, task guidance, confidence labels, pause screens, saving/error screens, completion-code page, tutorial-complete page, reward summary, and final recovery instructions.

Asset names, task IDs, QIDs, schedule IDs, result schemas, DataPipe fields, endpoint, and package paths remain unchanged between branches.

## Validation

Both branch packages must pass:

- focused localization and experiment-runner tests;
- the complete test suite;
- production build;
- schedule validation;
- runtime package validation with 23 tasks and 92 variable objects;
- experiment package validation;
- tutorial lock SHA-256 validation;
- a structural comparison proving only locale/configured copy differs;
- browser smoke tests for tutorial, formal flow, pause, save, and completion-code behavior.

The release branches are committed independently. Pushing is performed only after both packages pass validation; merging into `main` is not part of this design.
