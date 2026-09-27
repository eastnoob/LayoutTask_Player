# Automatic Assignment and Explicit Pan Control Design

## Status

Design only. This document defines the next implementation; it does not claim that `/assign` exists.

## Goal

Make formal participants receive a server-assigned participant number and a deterministic balanced sequence, while keeping the current DataPipe-compatible receiver and making floor-plan panning available only through an explicit hold-to-pan control.

## Current State

- `receiver/docker-compose.yml` runs two services on the VPS: `receiver` and `caddy`.
- Caddy terminates public HTTP(S) traffic and reverse-proxies to `receiver:3000`.
- `receiver/app/server.py` currently accepts `/submit`, `/api/data/`, `/archive`, and `/health`.
- `receiver/app/storage.py` persists submission metadata and files in SQLite/JSONL/spool storage under the mounted `data` volume.
- There is no implemented server-side assignment endpoint. A static GitHub Pages client cannot safely allocate globally unique numbers by itself.
- `src/core/renderer.ts` already has viewport zoom controls and the current change replaces SVG right-button panning with a right-bottom `Pan` button. The implementation must be regression-tested, not replaced by another right-button gesture.

## Design

### Deployment boundary

Keep one VPS and the existing two-container arrangement:

```text
GitHub Pages -> Caddy container -> receiver container
                                      |- /assign
                                      |- /submit
                                      |- /api/data/
                                      |- /archive
                                      `- /health
```

`/assign` belongs in the existing receiver container and uses the existing persistent SQLite volume. Caddy remains a separate container. A separate assignment service and a new database are explicitly out of scope.

### Assignment contract

Add a JSON POST endpoint at `/assign` protected by the same origin/token policy as submission routes.

Request:

```json
{
  "experiment_id": "layout-task-run12-core23",
  "idempotency_token": "browser-generated-stable-token",
  "schedule_version": "run12-williams-v1"
}
```

Response on success:

```json
{
  "participant_number": 1,
  "sequence_id": "sequence-01",
  "schedule_version": "run12-williams-v1",
  "assignment_id": "..."
}
```

The exact schedule version must be validated against the server's configured schedule. The browser may use the returned sequence, but it must not choose the participant number or silently fall back to sequence 1.

### Allocation and idempotency

Store assignments separately from submissions. The assignment transaction must:

1. Return the existing assignment for the same `(experiment_id, idempotency_token)`.
2. Otherwise allocate the next participant number atomically.
3. Select the sequence with `(participant_number - 1) % sequence_count`.
4. Persist the assignment before returning it.

For Run12, `sequence_count` is read from the configured schedule; it is not hard-coded in the endpoint. If the schedule has 46 sequences, participants 1-46 use each sequence once and participant 47 starts the next cycle at sequence 1.

Persist at least:

```text
assignment_id
experiment_id
idempotency_token
participant_number
sequence_id
schedule_version
assigned_at
```

### Frontend data flow

The formal experiment requests an assignment before starting the trial timeline. The returned participant number, sequence ID, assignment ID, and schedule version become session metadata and are included in every trial, the final CSV/JSON, local backup, and archive request.

Assignment failure is a blocking start error in formal mode. It must be visible to the participant and recorded locally when possible; the app must not start with an unassigned or default sequence.

### Explicit pan control

The SVG must not use right-button drag for viewport panning and must not suppress the browser's context menu solely to support panning.

The right-bottom viewport tool group contains a `Pan` button. Panning starts on `pointerdown` on that button, captures the pointer, updates the camera while the pointer is moved, and ends on `pointerup` or `pointercancel`. The button exposes an active state and remains keyboard-visible. Zoom and reset controls remain unchanged.

Object manipulation continues to use its existing controls. The pan button must not change object transforms, collision rules, or experiment data semantics.

## Non-goals

- No separate assignment container or service.
- No client-only participant counter.
- No automatic fallback to a fixed sequence.
- No change to the 46-sequence balanced schedule generation algorithm.
- No freehand drag gesture on the floor-plan SVG.
- No change to object movement, rotation, collision, or scoring logic.

## Acceptance criteria

1. Two concurrent assignment requests cannot receive the same participant number.
2. Repeating a request with the same idempotency token returns the same assignment without consuming another number.
3. Participant numbers select the configured schedule cyclically and use every configured sequence once per cycle.
4. Assignment and submission records survive receiver restart through the existing persistent volume.
5. Formal mode cannot begin without a successful assignment.
6. Final outputs contain the assignment metadata and the same participant identity used by the receiver.
7. Right-clicking the floor-plan is no longer the pan gesture and is not intercepted by the renderer.
8. Holding `Pan` and dragging moves the viewport; releasing it stops movement; zoom and reset still work.
9. The pan control remains usable when the experiment is paused or locked, according to the existing pause/lock policy, without leaving a stuck pointer-capture state.

## Grill Me self-check

- **Hidden duplicate allocation?** Covered by the unique idempotency key and an atomic allocation transaction.
- **Does static hosting break this?** No; the browser only calls the HTTPS receiver. The VPS owns global allocation.
- **Does sequence 1 reappear on failure?** Explicitly forbidden; formal start is blocked.
- **Does 46 get hard-coded?** No; the configured schedule length is authoritative.
- **Does assignment metadata get lost?** It is required in session, per-trial, final output, local backup, and archive payloads.
- **Does the pan change experiment behavior?** No; it operates only on the camera layer.
- **Can right-click still conflict?** The SVG right-drag listeners and renderer context-menu suppression are removed.
- **Can pointer capture stick?** `pointerup` and `pointercancel` both clear capture and active state.

## Decision

The design is internally consistent and scoped to one implementation plan. It deliberately keeps assignment and DataPipe handling in the existing receiver container and treats the pan-button work as a focused renderer regression task.
