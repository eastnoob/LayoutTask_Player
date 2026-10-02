# Reward Incentive Design

## Status

Approved implementation target for the reward-incentive branch.

## Scope

Add an optional, language-independent reward calculation to the experiment
runner. The feature is configured at experiment level and is enabled by
default for new configurations. Existing interaction, confidence, pause,
upload, and export behavior remains unchanged when reward metadata is absent
or the feature is disabled.

## Confirmed default policy

- Base reward: `200` cents (€2.00).
- Correct movement: `6` cents per furniture group presentation.
- Correct rotation: `6` cents per furniture group presentation.
- A scorable group earns 0, 6, or 12 cents.
- An explicitly unscorable group earns the derived 12 cents after it is saved.
- Repeated scene presentations are independent reward presentations.
- No live reward amount or correctness feedback is shown during trials.
- The final page shows the earned reward breakdown.
- All calculations use integer cents; display converts cents to euros.

The 19 unscorable groups are not inferred from a presumed total of 100. The
compiled task/reference data is authoritative. A group is unscorable only
when the reward reference explicitly marks it `scorable: false`.

## Configuration and reference data

`experiment.json` gains an optional `reward` block:

```json
{
  "enabled": true,
  "base_reward_cents": 200,
  "movement_reward_cents": 6,
  "rotation_reward_cents": 6,
  "reference_path": "scoring/scoring-reference.json"
}
```

The scoring reference gains optional `scorable` and `reward_version` metadata.
Existing references without these fields remain readable: objects with a
target are scorable; objects without a target do not receive a reward unless
the reference explicitly marks them unscorable. This compatibility rule is
only a parser fallback, not a way to manufacture missing furniture groups.

## Calculation

For each saved presentation, resolve reference objects by `group_id` and keep
one reward record per group. Compare the submitted relative step state with
the exact reference relative steps. Position and rotation are independent.
The group reward is the sum of the two configured component rewards. The
derived unscorable reward is the same two component rewards, because an
unscorable group is rewarded for completion rather than correctness.

Each reward record includes:

- `group_id`, `scorable`, `position_correct`, `rotation_correct`
- `movement_reward_cents`, `rotation_reward_cents`, `reward_cents`
- `cumulative_reward_cents`
- `reward_version` and `answer_reference_version`

The tutorial is exported as a tutorial record but never contributes to the
formal reward total.

## Data flow

1. The loader fetches the configured scoring reference alongside the schedule.
2. The runner passes the reference and reward config into each formal task.
3. The task result keeps its existing schema and receives optional reward
   metadata, so old result consumers remain valid.
4. The experiment exporter adds reward columns to results CSV and a reward
   summary to debug JSON. Existing raw result/event files remain intact.
5. The final page displays the base reward, earned component rewards, and total.
6. Receiver/DataPipe submission carries the same files and reference/version
   metadata. No new service or container is introduced.

The client calculation is provisional and user-facing only. The receiver can
recompute later from the stored result and the pinned reference version; this
implementation does not trust a client total as an authorization decision.

## Failure behavior

- Invalid reward values fail config validation.
- Missing reference data disables per-group scoring for that presentation and
  records the reason in debug metadata; it must not fabricate a score.
- Upload failure keeps the complete local recovery ZIP behavior unchanged.
- Reward disabled means no reward UI and no reward-based behavioral changes.

## Testing acceptance criteria

- Unit tests cover exact position/rotation matches, partial credit, unscorable
  completion, repeated presentations, cumulative cents, and duplicate object
  IDs sharing one group.
- Schema/loader tests cover defaults, explicit disabling, and reference loading.
- Export tests prove JSON and CSV contain aligned reward fields without
  double-counting fixed and variable SVG objects.
- Runner tests prove the final page receives the calculated total while no
  trial page exposes live reward feedback.
- Existing TypeScript, Vitest, receiver pytest, and production build checks
  remain green.
