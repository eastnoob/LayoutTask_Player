# Self-Hosted Data Receiver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static-host-compatible self-hosted receiver save mode and a Dockerized VPS receiver that stores raw CSV/debug files, JSONL submission logs, and SQLite metadata.

**Architecture:** The existing Vite/jsPsych frontend remains a pure static build and gains an experiment-level `receiver` data-save mode. The receiver is a separate Python standard-library service under `receiver/`, with `http.server`, `sqlite3`, file storage, JSONL logging, CORS, token checks, size limits, and a local clear-data command. DataPipe and copy modes remain compatible.

**Tech Stack:** TypeScript, Zod, jsPsych, Vitest, Python 3.12 standard library, `unittest`, SQLite, Docker Compose, Caddy.

**Spec:** `docs/superpowers/specs/2026-09-18-self-hosted-data-receiver-design.md`

## Global Constraints

- The experiment frontend must still build to static assets.
- The experiment frontend must still work from GitHub Pages or another static host.
- Participants must not need login, installation, VPN, or access to the VPS dashboard.
- The VPS must expose only the HTTPS receiver endpoint to participants.
- Database ports, data files, admin tools, and destructive operations must not be exposed publicly.
- Automatic upload failure must still produce a participant-visible fallback with the generated data.
- SQL is not the only source of truth; raw submitted files and JSONL logs must be preserved.
- No public delete or clear-data HTTP endpoint.

---

## File Structure

- Modify `src/types/experiment.ts`: add `ExperimentReceiverSaveConfig` and include it in `ExperimentDataSaveConfig`.
- Modify `src/schemas/experiment.schema.ts`: parse `data_save.mode = "receiver"` from static `experiment.json`.
- Modify `src/schemas/experiment.schema.test.ts`: cover receiver parsing and defaults.
- Modify `src/experiment-runner.ts`: build receiver batch submissions from existing CSV files and send one `POST /submit`.
- Modify `src/experiment-runner.test.ts`: cover receiver request body, token header, copy mode, DataPipe compatibility, and failure fallback.
- Modify `README.md`: document experiment-level self-hosted receiver mode and static deployment relationship.
- Create `receiver/app/__init__.py`: package marker.
- Create `receiver/app/config.py`: environment parsing and runtime config.
- Create `receiver/app/models.py`: validation, filename classification, and normalized submission structures.
- Create `receiver/app/storage.py`: SQLite schema, raw file writes, JSONL append, clear-data logic.
- Create `receiver/app/server.py`: HTTP routes, CORS, token checks, size limits, and rate limiting.
- Create `receiver/app/clear_data.py`: local operational clear command.
- Create `receiver/tests/test_models.py`: validation and classification tests.
- Create `receiver/tests/test_storage.py`: JSONL/files/SQLite/clear-data tests.
- Create `receiver/tests/test_server.py`: HTTP route, CORS, token, limit, and rate-limit tests.
- Create `receiver/Dockerfile`: Python runtime image.
- Create `receiver/docker-compose.yml`: receiver plus Caddy.
- Create `receiver/Caddyfile.example`: reverse proxy template.
- Create `receiver/README.md`: deployment, environment, clearing test data, and smoke-test instructions.

---

### Task 1: Add Receiver Mode To Experiment Config

**Files:**
- Modify: `src/types/experiment.ts`
- Modify: `src/schemas/experiment.schema.ts`
- Test: `src/schemas/experiment.schema.test.ts`

**Interfaces:**
- Consumes: existing `ExperimentDataSaveConfig` union.
- Produces:
  - `ExperimentReceiverSaveConfig`
  - parsed runtime config `{ mode: "receiver", experimentId, endpoint, filenamePrefix, submitToken? }`

- [ ] **Step 1: Write the failing schema test**

Add this test to `src/schemas/experiment.schema.test.ts`:

```ts
it("accepts self-hosted receiver data save mode", () => {
  const input = baseExperiment();
  input.data_save = {
    mode: "receiver",
    experiment_id: "layout_task_v1",
    endpoint: "https://data.example.com/submit",
    filename_prefix: "layout-task",
    submit_token: "public-study-token",
  };

  expect(parseExperimentConfig(input)).toMatchObject({
    dataSave: {
      mode: "receiver",
      experimentId: "layout_task_v1",
      endpoint: "https://data.example.com/submit",
      filenamePrefix: "layout-task",
      submitToken: "public-study-token",
    },
  });
});
```

- [ ] **Step 2: Run the focused schema test and verify failure**

Run:

```bash
pixi run test src/schemas/experiment.schema.test.ts
```

Expected: FAIL because `receiver` is not a valid discriminant yet.

- [ ] **Step 3: Add the receiver runtime type**

In `src/types/experiment.ts`, add:

```ts
export interface ExperimentReceiverSaveConfig {
  mode: "receiver";
  experimentId: string;
  endpoint: string;
  filenamePrefix: string;
  submitToken?: string;
}
```

Change the union:

```ts
export type ExperimentDataSaveConfig =
  | ExperimentCopyDataSaveConfig
  | ExperimentDataPipeSaveConfig
  | ExperimentReceiverSaveConfig;
```

- [ ] **Step 4: Extend the Zod schema and parser**

In `src/schemas/experiment.schema.ts`, add a third discriminated union member:

```ts
z.object({
  mode: z.literal("receiver"),
  experiment_id: z.string().min(1),
  endpoint: z.string().url(),
  filename_prefix: z.string().min(1).default("layout-task"),
  submit_token: z.string().min(1).optional(),
})
```

Update `parseExperimentConfig()`:

```ts
const dataSave =
  parsed.data_save.mode === "datapipe"
    ? {
        mode: "datapipe" as const,
        experimentId: parsed.data_save.experiment_id,
        endpoint: parsed.data_save.endpoint,
        filenamePrefix: parsed.data_save.filename_prefix,
      }
    : parsed.data_save.mode === "receiver"
      ? {
          mode: "receiver" as const,
          experimentId: parsed.data_save.experiment_id,
          endpoint: parsed.data_save.endpoint,
          filenamePrefix: parsed.data_save.filename_prefix,
          submitToken: parsed.data_save.submit_token,
        }
      : {
          mode: "copy" as const,
          filenamePrefix: parsed.data_save.filename_prefix,
        };
```

- [ ] **Step 5: Run the focused schema test and verify pass**

Run:

```bash
pixi run test src/schemas/experiment.schema.test.ts
```

Expected: PASS.

---

### Task 2: Post Batch Receiver Submissions From The Static Experiment Runner

**Files:**
- Modify: `src/experiment-runner.ts`
- Test: `src/experiment-runner.test.ts`

**Interfaces:**
- Consumes: `ExperimentReceiverSaveConfig`, `ExperimentCsvFile[]`.
- Produces: receiver request shape:

```ts
interface ReceiverSubmissionFile {
  filename: string;
  content_type: "text/csv";
  data: string;
}

interface ReceiverSubmission {
  schema: "layouttask.receiver.submission.v1";
  experiment_id: string;
  participant_id: string;
  session_id: string;
  files: ReceiverSubmissionFile[];
}
```

- [ ] **Step 1: Add a test for one receiver batch POST**

In `src/experiment-runner.test.ts`, add a config helper:

```ts
function receiverExperimentConfig(): ExperimentConfig {
  return {
    ...experimentConfig(),
    dataSave: {
      mode: "receiver",
      experimentId: "layout_task_v1",
      endpoint: "https://data.example.com/submit",
      filenamePrefix: "layout-task",
      submitToken: "public-study-token",
    },
  };
}
```

Add this test inside `describe("saveExperimentFiles", ...)`:

```ts
it("posts one batch submission to the self-hosted receiver", async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, statusText: "Created" })) as unknown as typeof fetch;

  const result = await saveExperimentFiles({
    dataSave: receiverExperimentConfig().dataSave,
    participantId: "P001",
    sessionId: "S001",
    files: [
      { filename: "layout_session_P001_S001.csv", data: "a\n1\n" },
      { filename: "layout_results_P001_S001.csv", data: "b\n2\n" },
      { filename: "layout_events_P001_S001.csv", data: "c\n3\n" },
    ],
    fetchImpl,
  });

  expect(result).toEqual({ ok: true, saved: 3 });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith("https://data.example.com/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Submit-Token": "public-study-token",
    },
    body: expect.any(String),
  });

  const body = JSON.parse(String((fetchImpl as never as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls[0][1].body));
  expect(body).toEqual({
    schema: "layouttask.receiver.submission.v1",
    experiment_id: "layout_task_v1",
    participant_id: "P001",
    session_id: "S001",
    files: [
      { filename: "layout_session_P001_S001.csv", content_type: "text/csv", data: "a\n1\n" },
      { filename: "layout_results_P001_S001.csv", content_type: "text/csv", data: "b\n2\n" },
      { filename: "layout_events_P001_S001.csv", content_type: "text/csv", data: "c\n3\n" },
    ],
  });
});
```

- [ ] **Step 2: Add a test for receiver failure details**

Add:

```ts
it("reports receiver JSON error details", async () => {
  const fetchImpl = vi.fn(async () => ({
    ok: false,
    status: 413,
    statusText: "Payload Too Large",
    clone: () => ({
      json: async () => ({ error: "body_too_large", message: "Request body is too large." }),
    }),
    text: async () => "",
  })) as unknown as typeof fetch;

  const result = await saveExperimentFiles({
    dataSave: receiverExperimentConfig().dataSave,
    participantId: "P001",
    sessionId: "S001",
    files: [{ filename: "layout_session_P001_S001.csv", data: "a\n1\n" }],
    fetchImpl,
  });

  expect(result).toMatchObject({
    ok: false,
    saved: 0,
    failedFilename: "receiver batch",
  });
  expect(result.error).toContain("413 Payload Too Large");
  expect(result.error).toContain("body_too_large");
});
```

- [ ] **Step 3: Run the focused runner test and verify failure**

Run:

```bash
pixi run test src/experiment-runner.test.ts
```

Expected: FAIL because `saveExperimentFiles()` does not accept `participantId` / `sessionId` and does not branch on receiver mode.

- [ ] **Step 4: Update the save function signature**

In `src/experiment-runner.ts`, change the input type:

```ts
export async function saveExperimentFiles(input: {
  dataSave: ExperimentDataSaveConfig;
  files: ExperimentCsvFile[];
  participantId?: string;
  sessionId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ ok: boolean; error?: string; saved: number; failedFilename?: string }> {
```

The existing DataPipe tests can omit `participantId` and `sessionId`. The receiver branch must require them at runtime.

- [ ] **Step 5: Implement receiver request creation**

Add a helper in `src/experiment-runner.ts`:

```ts
function createReceiverSubmission(input: {
  dataSave: Extract<ExperimentDataSaveConfig, { mode: "receiver" }>;
  participantId: string;
  sessionId: string;
  files: ExperimentCsvFile[];
}) {
  return {
    schema: "layouttask.receiver.submission.v1" as const,
    experiment_id: input.dataSave.experimentId,
    participant_id: input.participantId,
    session_id: input.sessionId,
    files: input.files.map((file) => ({
      filename: file.filename,
      content_type: "text/csv" as const,
      data: file.data,
    })),
  };
}
```

- [ ] **Step 6: Add the receiver branch**

In `saveExperimentFiles()`, after copy mode and before DataPipe payload creation:

```ts
if (input.dataSave.mode === "receiver") {
  if (!input.participantId || !input.sessionId) {
    return { ok: false, saved: 0, failedFilename: "receiver batch", error: "participantId and sessionId are required for receiver mode" };
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = input.timeoutMs ?? 60_000;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.dataSave.submitToken) {
    headers["X-Submit-Token"] = input.dataSave.submitToken;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      () =>
        fetchImpl(input.dataSave.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(createReceiverSubmission({
            dataSave: input.dataSave,
            participantId: input.participantId!,
            sessionId: input.sessionId!,
            files: input.files,
          })),
        }),
      timeoutMs,
      "receiver batch",
    );
  } catch (error) {
    return { ok: false, saved: 0, failedFilename: "receiver batch", error: error instanceof Error ? error.message : String(error) };
  }

  if (!response.ok) {
    return {
      ok: false,
      saved: 0,
      failedFilename: "receiver batch",
      error: `${response.status} ${response.statusText}${await readSaveError(response)}`,
    };
  }

  return { ok: true, saved: input.files.length };
}
```

- [ ] **Step 7: Add shared response error parsing**

Move the DataPipe-only error parsing behavior into a generic helper:

```ts
async function readSaveError(response: Response): Promise<string> {
  try {
    const body = await response.clone().json() as { code?: string; error?: string; message?: string };
    const code = body.code ?? body.error;
    const message = body.message;
    if (code || message) {
      return ` (${[code, message].filter(Boolean).join(": ")})`;
    }
  } catch {
  }

  try {
    const text = await response.text();
    return text ? ` (${text.slice(0, 240)})` : "";
  } catch {
    return "";
  }
}
```

Use it for both receiver and DataPipe non-OK responses.

- [ ] **Step 8: Pass participant/session ids from `on_finish`**

In `createRunnableExperiment()`:

```ts
renderEndPage(files, await saveExperimentFiles({
  dataSave: config.dataSave,
  participantId,
  sessionId,
  files,
}));
```

- [ ] **Step 9: Run focused runner test and verify pass**

Run:

```bash
pixi run test src/experiment-runner.test.ts
```

Expected: PASS.

---

### Task 3: Create Receiver Validation And Model Helpers

**Files:**
- Create: `receiver/app/__init__.py`
- Create: `receiver/app/models.py`
- Test: `receiver/tests/test_models.py`

**Interfaces:**
- Produces:
  - `ValidationError`
  - `SubmittedFile`
  - `Submission`
  - `validate_submission(payload, max_files, max_file_bytes)`
  - `classify_file_kind(filename)`
  - `safe_filename(filename)`

- [ ] **Step 1: Create the failing model tests**

Create `receiver/tests/test_models.py`:

```python
import unittest

from app.models import ValidationError, classify_file_kind, safe_filename, validate_submission


class ModelTests(unittest.TestCase):
    def valid_payload(self):
        return {
            "schema": "layouttask.receiver.submission.v1",
            "experiment_id": "layout_task_v1",
            "participant_id": "P001",
            "session_id": "S001",
            "files": [
                {"filename": "layout_session_P001_S001.csv", "content_type": "text/csv", "data": "a\n1\n"},
                {"filename": "layout_results_P001_S001.csv", "content_type": "text/csv", "data": "b\n2\n"},
                {"filename": "layout_events_P001_S001.csv", "content_type": "text/csv", "data": "c\n3\n"},
                {"filename": "layout_debug_P001_S001.json", "content_type": "application/json", "data": "{}"},
            ],
        }

    def test_classifies_known_file_kinds(self):
        self.assertEqual(classify_file_kind("layout_session_P001_S001.csv"), "session")
        self.assertEqual(classify_file_kind("layout_results_P001_S001.csv"), "results")
        self.assertEqual(classify_file_kind("layout_events_P001_S001.csv"), "events")
        self.assertEqual(classify_file_kind("layout_debug_P001_S001.json"), "debug")
        self.assertEqual(classify_file_kind("notes.txt"), "unknown")

    def test_rejects_path_traversal_filename(self):
        with self.assertRaisesRegex(ValidationError, "invalid_filename"):
            safe_filename("../layout_session.csv")

    def test_accepts_valid_submission(self):
        submission = validate_submission(self.valid_payload(), max_files=8, max_file_bytes=1024)
        self.assertEqual(submission.experiment_id, "layout_task_v1")
        self.assertEqual(submission.participant_id, "P001")
        self.assertEqual(submission.session_id, "S001")
        self.assertEqual([file.kind for file in submission.files], ["session", "results", "events", "debug"])

    def test_rejects_too_many_files(self):
        payload = self.valid_payload()
        payload["files"] = payload["files"] * 3
        with self.assertRaisesRegex(ValidationError, "too_many_files"):
            validate_submission(payload, max_files=8, max_file_bytes=1024)

    def test_rejects_oversized_file(self):
        payload = self.valid_payload()
        payload["files"][0]["data"] = "x" * 1025
        with self.assertRaisesRegex(ValidationError, "file_too_large"):
            validate_submission(payload, max_files=8, max_file_bytes=1024)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run model tests and verify failure**

Run:

```bash
python -m unittest discover -s receiver/tests -p "test_models.py"
```

Expected: FAIL because receiver modules do not exist.

- [ ] **Step 3: Add package marker**

Create `receiver/app/__init__.py` as an empty file.

- [ ] **Step 4: Implement `models.py`**

Create `receiver/app/models.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePath, PureWindowsPath
from typing import Any


class ValidationError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


@dataclass(frozen=True)
class SubmittedFile:
    filename: str
    content_type: str
    data: str
    kind: str


@dataclass(frozen=True)
class Submission:
    experiment_id: str
    participant_id: str
    session_id: str
    files: list[SubmittedFile]


def classify_file_kind(filename: str) -> str:
    if filename.startswith("layout_session_") and filename.endswith(".csv"):
        return "session"
    if filename.startswith("layout_results_") and filename.endswith(".csv"):
        return "results"
    if filename.startswith("layout_events_") and filename.endswith(".csv"):
        return "events"
    if filename.startswith("layout_debug_") and filename.endswith(".json"):
        return "debug"
    return "unknown"


def safe_filename(filename: Any) -> str:
    if not isinstance(filename, str) or not filename:
        raise ValidationError("invalid_filename", "filename must be a non-empty string")
    if filename != PurePath(filename).name or filename != PureWindowsPath(filename).name:
        raise ValidationError("invalid_filename", "submitted filenames must not contain path separators")
    if any(char in filename for char in ('/', '\\', '\x00', ':')):
        raise ValidationError("invalid_filename", "submitted filenames must be basename-only")
    return filename


def require_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValidationError("invalid_submission", f"{field} must be a non-empty string")
    return value


def validate_submission(payload: Any, max_files: int, max_file_bytes: int) -> Submission:
    if not isinstance(payload, dict):
        raise ValidationError("invalid_submission", "request body must be a JSON object")
    if payload.get("schema") != "layouttask.receiver.submission.v1":
        raise ValidationError("invalid_schema", "schema must be layouttask.receiver.submission.v1")

    experiment_id = require_text(payload.get("experiment_id"), "experiment_id")
    participant_id = require_text(payload.get("participant_id"), "participant_id")
    session_id = require_text(payload.get("session_id"), "session_id")
    raw_files = payload.get("files")
    if not isinstance(raw_files, list) or not raw_files:
        raise ValidationError("invalid_files", "files must be a non-empty array")
    if len(raw_files) > max_files:
        raise ValidationError("too_many_files", f"at most {max_files} files are allowed")

    files: list[SubmittedFile] = []
    for raw_file in raw_files:
        if not isinstance(raw_file, dict):
            raise ValidationError("invalid_file", "each file must be an object")
        filename = safe_filename(raw_file.get("filename"))
        content_type = raw_file.get("content_type")
        data = raw_file.get("data")
        if not isinstance(content_type, str) or not content_type:
            content_type = "text/plain"
        if not isinstance(data, str):
            raise ValidationError("invalid_file", "file data must be a string")
        size_bytes = len(data.encode("utf-8"))
        if size_bytes > max_file_bytes:
            raise ValidationError("file_too_large", f"{filename} exceeds {max_file_bytes} bytes")
        files.append(SubmittedFile(filename=filename, content_type=content_type, data=data, kind=classify_file_kind(filename)))

    return Submission(
        experiment_id=experiment_id,
        participant_id=participant_id,
        session_id=session_id,
        files=files,
    )
```

- [ ] **Step 5: Run model tests and verify pass**

Run:

```bash
python -m unittest discover -s receiver/tests -p "test_models.py"
```

Expected: PASS.

---

### Task 4: Implement Receiver Storage With Raw Files, JSONL, SQLite, And Clear Data

**Files:**
- Create: `receiver/app/storage.py`
- Create: `receiver/app/clear_data.py`
- Test: `receiver/tests/test_storage.py`

**Interfaces:**
- Consumes: `Submission`.
- Produces:
  - `ReceiverStorage(data_dir)`
  - `ReceiverStorage.save_submission(submission, remote_addr, user_agent, body_sha256) -> StoredSubmission`
  - `ReceiverStorage.clear_data()`

- [ ] **Step 1: Write storage tests**

Create `receiver/tests/test_storage.py`:

```python
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.models import validate_submission
from app.storage import ReceiverStorage


class StorageTests(unittest.TestCase):
    def valid_submission(self):
        return validate_submission(
            {
                "schema": "layouttask.receiver.submission.v1",
                "experiment_id": "layout_task_v1",
                "participant_id": "P001",
                "session_id": "S001",
                "files": [
                    {"filename": "layout_session_P001_S001.csv", "content_type": "text/csv", "data": "a\n1\n"},
                    {"filename": "layout_results_P001_S001.csv", "content_type": "text/csv", "data": "b\n2\n"},
                    {"filename": "layout_events_P001_S001.csv", "content_type": "text/csv", "data": "c\n3\n"},
                ],
            },
            max_files=8,
            max_file_bytes=1024,
        )

    def test_saves_jsonl_files_and_sqlite_rows(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir))
            stored = storage.save_submission(
                self.valid_submission(),
                remote_addr="127.0.0.1",
                user_agent="UnitTest",
                body_sha256="abc123",
            )

            self.assertTrue((Path(temp_dir) / "submissions.jsonl").exists())
            jsonl_line = (Path(temp_dir) / "submissions.jsonl").read_text(encoding="utf-8").strip()
            self.assertEqual(json.loads(jsonl_line)["id"], stored.id)

            file_path = Path(temp_dir) / "files" / "layout_task_v1" / "P001" / "S001" / "layout_results_P001_S001.csv"
            self.assertEqual(file_path.read_text(encoding="utf-8"), "b\n2\n")

            connection = sqlite3.connect(Path(temp_dir) / "submissions.sqlite")
            try:
                submission_count = connection.execute("SELECT count(*) FROM submissions").fetchone()[0]
                file_count = connection.execute("SELECT count(*) FROM submission_files").fetchone()[0]
                kinds = [row[0] for row in connection.execute("SELECT kind FROM submission_files ORDER BY filename").fetchall()]
            finally:
                connection.close()
            self.assertEqual(submission_count, 1)
            self.assertEqual(file_count, 3)
            self.assertEqual(kinds, ["events", "results", "session"])

    def test_clear_data_removes_files_and_resets_tables(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            storage = ReceiverStorage(Path(temp_dir))
            storage.save_submission(self.valid_submission(), remote_addr=None, user_agent=None, body_sha256="abc123")
            storage.clear_data()

            self.assertFalse((Path(temp_dir) / "files").exists())
            self.assertEqual((Path(temp_dir) / "submissions.jsonl").read_text(encoding="utf-8"), "")

            connection = sqlite3.connect(Path(temp_dir) / "submissions.sqlite")
            try:
                self.assertEqual(connection.execute("SELECT count(*) FROM submissions").fetchone()[0], 0)
                self.assertEqual(connection.execute("SELECT count(*) FROM submission_files").fetchone()[0], 0)
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run storage tests and verify failure**

Run:

```bash
python -m unittest discover -s receiver/tests -p "test_storage.py"
```

Expected: FAIL because `app.storage` does not exist.

- [ ] **Step 3: Implement SQLite schema and save logic**

Create `receiver/app/storage.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import uuid

from .models import Submission


@dataclass(frozen=True)
class StoredSubmission:
    id: str
    file_count: int


class ReceiverStorage:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.files_dir = data_dir / "files"
        self.jsonl_path = data_dir / "submissions.jsonl"
        self.sqlite_path = data_dir / "submissions.sqlite"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.ensure_schema()

    def ensure_schema(self) -> None:
        with sqlite3.connect(self.sqlite_path) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS submissions(
                  id TEXT PRIMARY KEY,
                  experiment_id TEXT NOT NULL,
                  participant_id TEXT NOT NULL,
                  session_id TEXT NOT NULL,
                  received_at TEXT NOT NULL,
                  remote_addr TEXT,
                  user_agent TEXT,
                  file_count INTEGER NOT NULL,
                  status TEXT NOT NULL,
                  body_sha256 TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS submission_files(
                  id TEXT PRIMARY KEY,
                  submission_id TEXT NOT NULL,
                  filename TEXT NOT NULL,
                  kind TEXT NOT NULL,
                  content_type TEXT,
                  size_bytes INTEGER NOT NULL,
                  sha256 TEXT NOT NULL,
                  path TEXT NOT NULL,
                  FOREIGN KEY(submission_id) REFERENCES submissions(id)
                );

                CREATE TABLE IF NOT EXISTS receiver_logs(
                  id TEXT PRIMARY KEY,
                  submission_id TEXT,
                  level TEXT NOT NULL,
                  message TEXT NOT NULL,
                  detail_json TEXT,
                  created_at TEXT NOT NULL,
                  FOREIGN KEY(submission_id) REFERENCES submissions(id)
                );
                """
            )

    def save_submission(self, submission: Submission, remote_addr: str | None, user_agent: str | None, body_sha256: str) -> StoredSubmission:
        submission_id = uuid.uuid4().hex
        received_at = datetime.now(timezone.utc).isoformat()
        target_dir = self.files_dir / submission.experiment_id / submission.participant_id / submission.session_id
        target_dir.mkdir(parents=True, exist_ok=True)

        file_records = []
        for submitted_file in submission.files:
            file_id = uuid.uuid4().hex
            data_bytes = submitted_file.data.encode("utf-8")
            file_sha256 = hashlib.sha256(data_bytes).hexdigest()
            path = target_dir / submitted_file.filename
            path.write_text(submitted_file.data, encoding="utf-8")
            file_records.append(
                {
                    "id": file_id,
                    "submission_id": submission_id,
                    "filename": submitted_file.filename,
                    "kind": submitted_file.kind,
                    "content_type": submitted_file.content_type,
                    "size_bytes": len(data_bytes),
                    "sha256": file_sha256,
                    "path": str(path),
                }
            )

        with sqlite3.connect(self.sqlite_path) as connection:
            connection.execute(
                """
                INSERT INTO submissions(
                  id, experiment_id, participant_id, session_id, received_at,
                  remote_addr, user_agent, file_count, status, body_sha256
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    submission_id,
                    submission.experiment_id,
                    submission.participant_id,
                    submission.session_id,
                    received_at,
                    remote_addr,
                    user_agent,
                    len(submission.files),
                    "accepted",
                    body_sha256,
                ),
            )
            connection.executemany(
                """
                INSERT INTO submission_files(
                  id, submission_id, filename, kind, content_type, size_bytes, sha256, path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        record["id"],
                        record["submission_id"],
                        record["filename"],
                        record["kind"],
                        record["content_type"],
                        record["size_bytes"],
                        record["sha256"],
                        record["path"],
                    )
                    for record in file_records
                ],
            )

        with self.jsonl_path.open("a", encoding="utf-8") as jsonl:
            jsonl.write(
                json.dumps(
                    {
                        "id": submission_id,
                        "experiment_id": submission.experiment_id,
                        "participant_id": submission.participant_id,
                        "session_id": submission.session_id,
                        "received_at": received_at,
                        "remote_addr": remote_addr,
                        "user_agent": user_agent,
                        "body_sha256": body_sha256,
                        "files": file_records,
                    },
                    ensure_ascii=True,
                )
                + "\n"
            )

        return StoredSubmission(id=submission_id, file_count=len(submission.files))

    def clear_data(self) -> None:
        if self.files_dir.exists():
            shutil.rmtree(self.files_dir)
        self.jsonl_path.write_text("", encoding="utf-8")
        if self.sqlite_path.exists():
            self.sqlite_path.unlink()
        self.ensure_schema()
```

- [ ] **Step 4: Add the clear-data entry point**

Create `receiver/app/clear_data.py`:

```python
from pathlib import Path
import os

from .storage import ReceiverStorage


def main() -> None:
    data_dir = Path(os.environ.get("DATA_DIR", "/app/data"))
    ReceiverStorage(data_dir).clear_data()
    print(f"cleared receiver data in {data_dir}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run storage tests and verify pass**

Run:

```bash
python -m unittest discover -s receiver/tests -p "test_storage.py"
```

Expected: PASS.

---

### Task 5: Implement HTTP Server With CORS, Token, Size Limits, And Rate Limit

**Files:**
- Create: `receiver/app/config.py`
- Create: `receiver/app/server.py`
- Test: `receiver/tests/test_server.py`

**Interfaces:**
- Consumes: `ReceiverStorage`, validation helpers.
- Produces:
  - `GET /health`
  - `POST /submit`
  - optional `POST /api/data/` DataPipe-compatible single-file route

- [ ] **Step 1: Write server tests**

Create `receiver/tests/test_server.py`:

```python
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

from app.config import ReceiverConfig
from app.server import create_server
from app.storage import ReceiverStorage


class ServerTests(unittest.TestCase):
    def start_server(self, config):
        storage = ReceiverStorage(config.data_dir)
        server = create_server(("127.0.0.1", 0), config, storage)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.shutdown)
        self.addCleanup(server.server_close)
        return server

    def post_json(self, server, path, payload, headers=None):
        connection = HTTPConnection("127.0.0.1", server.server_address[1])
        body = json.dumps(payload)
        request_headers = {"Content-Type": "application/json", "Origin": "https://pages.example"}
        request_headers.update(headers or {})
        connection.request("POST", path, body=body, headers=request_headers)
        response = connection.getresponse()
        data = response.read().decode("utf-8")
        connection.close()
        return response.status, dict(response.getheaders()), json.loads(data)

    def valid_payload(self):
        return {
            "schema": "layouttask.receiver.submission.v1",
            "experiment_id": "layout_task_v1",
            "participant_id": "P001",
            "session_id": "S001",
            "files": [
                {"filename": "layout_session_P001_S001.csv", "content_type": "text/csv", "data": "a\n1\n"},
            ],
        }

    def test_health(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token=None)
            server = self.start_server(config)
            connection = HTTPConnection("127.0.0.1", server.server_address[1])
            connection.request("GET", "/health")
            response = connection.getresponse()
            body = json.loads(response.read().decode("utf-8"))
            connection.close()
            self.assertEqual(response.status, 200)
            self.assertEqual(body, {"ok": True})

    def test_accepts_valid_submit_with_token_and_cors(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token="token")
            server = self.start_server(config)
            status, headers, body = self.post_json(server, "/submit", self.valid_payload(), {"X-Submit-Token": "token"})
            self.assertEqual(status, 201)
            self.assertTrue(body["ok"])
            self.assertEqual(headers["Access-Control-Allow-Origin"], "https://pages.example")

    def test_rejects_token_mismatch(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token="token")
            server = self.start_server(config)
            status, _headers, body = self.post_json(server, "/submit", self.valid_payload(), {"X-Submit-Token": "wrong"})
            self.assertEqual(status, 403)
            self.assertEqual(body["error"], "invalid_token")

    def test_rejects_disallowed_origin(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://allowed.example"], submit_token=None)
            server = self.start_server(config)
            status, _headers, body = self.post_json(server, "/submit", self.valid_payload())
            self.assertEqual(status, 403)
            self.assertEqual(body["error"], "origin_not_allowed")

    def test_accepts_datapipe_compat_route(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = ReceiverConfig(data_dir=Path(temp_dir), allowed_origins=["https://pages.example"], submit_token=None)
            server = self.start_server(config)
            status, _headers, body = self.post_json(
                server,
                "/api/data/",
                {"experimentID": "layout_task_v1", "filename": "layout_session_P001_S001.csv", "data": "a\n1\n"},
            )
            self.assertEqual(status, 201)
            self.assertTrue(body["ok"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run server tests and verify failure**

Run:

```bash
python -m unittest discover -s receiver/tests -p "test_server.py"
```

Expected: FAIL because `app.config` and `app.server` do not exist.

- [ ] **Step 3: Implement config parsing**

Create `receiver/app/config.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class ReceiverConfig:
    data_dir: Path
    allowed_origins: list[str]
    submit_token: str | None
    port: int = 3000
    max_body_bytes: int = 5_242_880
    max_files_per_submission: int = 8
    rate_limit_window_ms: int = 60_000
    rate_limit_max: int = 60


def load_config_from_env() -> ReceiverConfig:
    origins = [origin.strip() for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    return ReceiverConfig(
        data_dir=Path(os.environ.get("DATA_DIR", "/app/data")),
        allowed_origins=origins,
        submit_token=os.environ.get("SUBMIT_TOKEN") or None,
        port=int(os.environ.get("PORT", "3000")),
        max_body_bytes=int(os.environ.get("MAX_BODY_BYTES", "5242880")),
        max_files_per_submission=int(os.environ.get("MAX_FILES_PER_SUBMISSION", "8")),
        rate_limit_window_ms=int(os.environ.get("RATE_LIMIT_WINDOW_MS", "60000")),
        rate_limit_max=int(os.environ.get("RATE_LIMIT_MAX", "60")),
    )
```

- [ ] **Step 4: Implement the HTTP server**

Create `receiver/app/server.py` with `BaseHTTPRequestHandler`. Use these response helpers:

```python
def json_response(handler, status: int, body: dict, origin: str | None = None) -> None:
    data = json.dumps(body, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(data)))
    if origin:
        handler.send_header("Access-Control-Allow-Origin", origin)
        handler.send_header("Vary", "Origin")
    handler.end_headers()
    handler.wfile.write(data)
```

Define `create_server(address, config, storage)` returning `ThreadingHTTPServer`.

`do_GET` behavior:

```python
if self.path == "/health":
    json_response(self, 200, {"ok": True}, self.allowed_origin())
else:
    json_response(self, 404, {"ok": False, "error": "not_found", "message": "Route not found."}, self.allowed_origin())
```

`do_OPTIONS` behavior:

```python
origin = self.allowed_origin()
self.send_response(204)
if origin:
    self.send_header("Access-Control-Allow-Origin", origin)
    self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Submit-Token")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    self.send_header("Vary", "Origin")
self.end_headers()
```

`do_POST` behavior:

- reject paths other than `/submit` and `/api/data/` with 404.
- reject disallowed origin with 403.
- reject token mismatch with 403 when configured.
- reject body larger than `config.max_body_bytes` with 413.
- parse JSON.
- for `/submit`, call `validate_submission()`.
- for `/api/data/`, convert `{ experimentID, filename, data }` into one-file receiver schema using participant/session id `"datapipe-compat"`.
- hash raw body with SHA-256.
- call `storage.save_submission()`.
- return `201` with `{ "ok": true, "submission_id": stored.id, "file_count": stored.file_count }`.

Add simple per-IP in-memory rate limiting:

```python
rate_state: dict[str, list[float]] = {}
```

Remove timestamps outside `rate_limit_window_ms`, reject with 429 when length reaches `rate_limit_max`.

- [ ] **Step 5: Add module entry point**

At the bottom of `receiver/app/server.py`:

```python
def main() -> None:
    config = load_config_from_env()
    storage = ReceiverStorage(config.data_dir)
    server = create_server(("", config.port), config, storage)
    print(f"receiver listening on :{config.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run server tests and verify pass**

Run:

```bash
python -m unittest discover -s receiver/tests -p "test_server.py"
```

Expected: PASS.

---

### Task 6: Add Docker, Caddy, Receiver Documentation, And Frontend README

**Files:**
- Create: `receiver/Dockerfile`
- Create: `receiver/docker-compose.yml`
- Create: `receiver/Caddyfile.example`
- Create: `receiver/README.md`
- Modify: `README.md`

**Interfaces:**
- Produces:
  - Dockerized receiver on internal port `3000`.
  - Caddy public `80/443` reverse proxy.
  - `python -m app.clear_data` operational clear command.

- [ ] **Step 1: Add Dockerfile**

Create `receiver/Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY app ./app

ENV PYTHONUNBUFFERED=1
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000
CMD ["python", "-m", "app.server"]
```

- [ ] **Step 2: Add Docker Compose**

Create `receiver/docker-compose.yml`:

```yaml
services:
  receiver:
    build: .
    restart: unless-stopped
    environment:
      PORT: "3000"
      DATA_DIR: "/app/data"
      ALLOWED_ORIGINS: "${ALLOWED_ORIGINS}"
      SUBMIT_TOKEN: "${SUBMIT_TOKEN}"
      MAX_BODY_BYTES: "${MAX_BODY_BYTES:-5242880}"
      MAX_FILES_PER_SUBMISSION: "${MAX_FILES_PER_SUBMISSION:-8}"
      RATE_LIMIT_WINDOW_MS: "${RATE_LIMIT_WINDOW_MS:-60000}"
      RATE_LIMIT_MAX: "${RATE_LIMIT_MAX:-60}"
    volumes:
      - ./data:/app/data
    expose:
      - "3000"

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - receiver

volumes:
  caddy_data:
  caddy_config:
```

- [ ] **Step 3: Add Caddyfile example**

Create `receiver/Caddyfile.example`:

```caddyfile
data.example.com {
  reverse_proxy receiver:3000
}
```

- [ ] **Step 4: Add receiver README**

Create `receiver/README.md` with these sections:

```md
# Layout Task Receiver

This service receives completed Layout Task experiment files from a static frontend.

## Deployment

1. Point `data.example.com` to the VPS.
2. Copy `Caddyfile.example` to `Caddyfile` and replace the domain.
3. Create `.env`:

```text
ALLOWED_ORIGINS=https://your-github-pages-site.example
SUBMIT_TOKEN=public-study-token
```

4. Start:

```bash
docker compose up -d --build
```

## Data

Accepted submissions are stored in:

```text
data/submissions.jsonl
data/submissions.sqlite
data/files/<experiment>/<participant>/<session>/
```

Raw CSV and debug files are canonical. SQLite is an index and diagnostics database.

## Clear Test Data

Stop public traffic or stop the stack first, then run:

```bash
docker compose exec receiver python -m app.clear_data
```

No public delete route exists.

## Health Check

```bash
curl https://data.example.com/health
```
```

- [ ] **Step 5: Document frontend config in root README**

In `README.md`, under experiment runner / data save documentation, add:

```md
### Optional Self-Hosted Receiver Saving

The full experiment runner can save generated CSV files to a researcher-owned receiver while the experiment page itself remains statically hosted:

```json
{
  "data_save": {
    "mode": "receiver",
    "experiment_id": "layout_task_v1",
    "endpoint": "https://data.example.com/submit",
    "filename_prefix": "layout-task",
    "submit_token": "public-study-token"
  }
}
```

The receiver endpoint stores raw CSV files, an append-only JSONL log, and SQLite metadata. The token is visible in the static page, so it is not participant authentication; it is only a lightweight routing and abuse-reduction control.
```

- [ ] **Step 6: Smoke-check Docker files syntactically**

Run:

```bash
docker compose -f receiver/docker-compose.yml config
```

Expected: Docker Compose prints resolved configuration. If Docker is not installed, record that this check could not be run.

---

### Task 7: Full Verification

**Files:**
- No source changes unless verification finds a bug.

**Interfaces:**
- Verifies frontend, receiver, and documentation together.

- [ ] **Step 1: Run frontend schema and runner tests**

Run:

```bash
pixi run test src/schemas/experiment.schema.test.ts src/experiment-runner.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run all receiver tests**

Run:

```bash
python -m unittest discover -s receiver/tests
```

Expected: PASS.

- [ ] **Step 3: Run full frontend test suite**

Run:

```bash
pixi run test
```

Expected: PASS.

- [ ] **Step 4: Run frontend production build**

Run:

```bash
pixi run build
```

Expected: PASS and `dist/` is produced.

- [ ] **Step 5: Run a local receiver smoke test**

Start the receiver locally:

```bash
cd receiver
ALLOWED_ORIGINS=http://127.0.0.1:5173 SUBMIT_TOKEN=public-study-token python -m app.server
```

In another shell, submit:

```bash
curl -i http://127.0.0.1:3000/submit \
  -H "Content-Type: application/json" \
  -H "Origin: http://127.0.0.1:5173" \
  -H "X-Submit-Token: public-study-token" \
  --data '{"schema":"layouttask.receiver.submission.v1","experiment_id":"layout_task_v1","participant_id":"P001","session_id":"S001","files":[{"filename":"layout_session_P001_S001.csv","content_type":"text/csv","data":"a\n1\n"}]}'
```

Expected: `201 Created` with `"ok": true`, plus `receiver/data/files/layout_task_v1/P001/S001/layout_session_P001_S001.csv`.

- [ ] **Step 6: Verify clear-data command**

Run:

```bash
cd receiver
DATA_DIR=./data python -m app.clear_data
```

Expected: `data/submissions.jsonl` exists and is empty, raw files are removed, and SQLite tables exist with zero rows.

- [ ] **Step 7: Review working tree before handoff**

Run:

```bash
git status --short
```

Expected: only intended files are changed. Do not revert unrelated user edits.

---

## Self-Review

**Spec coverage:** The plan covers static frontend receiver mode in Tasks 1-2, batch `POST /submit` in Task 2, raw file + JSONL + SQLite storage in Task 4, CORS/token/limits/rate limit in Task 5, Docker/Caddy/VPS deployment in Task 6, no public delete endpoint in Tasks 4 and 6, and verification in Task 7.

**Placeholder scan:** The plan contains no unresolved placeholder instructions. Every implementation task names exact files and includes concrete code or exact behavior.

**Type consistency:** `ExperimentReceiverSaveConfig`, `ExperimentDataSaveConfig`, `ReceiverSubmission`, `SubmittedFile`, `Submission`, `ReceiverStorage`, and `ReceiverConfig` are introduced before use. `saveExperimentFiles()` is updated with optional `participantId` and `sessionId`; existing DataPipe callers continue to work because those fields are only required for receiver mode.

**Scope check:** Parsed `session_rows`, `result_rows`, and `event_rows` remain out of the first implementation because the spec allows them to be deferred and raw CSV files are preserved. This keeps the first receiver useful and testable without prematurely designing analysis tables.

**Static deployment check:** No task requires the frontend to run on the VPS. The only frontend change is static JSON config plus browser `fetch()` to an HTTPS receiver endpoint.
