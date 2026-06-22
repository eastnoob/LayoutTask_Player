# Code Commenting Guidelines

This project uses comments to explain domain meaning and irreversible assumptions, not to narrate TypeScript syntax.

## Audience

- Future experiment maintainers.
- People turning Rhino/GH exports into Layout Task protocol packages.

## What Comments Should Do

- Explain why a rule exists.
- Name the coordinate system or semantic layer a value belongs to.
- Call out experiment semantics, Rhino/CAD export assumptions, or analysis consequences.
- Add a short section comment before dense logic instead of sprinkling low-value inline comments everywhere.

## Language

- Write English first.
- Add Chinese when a comment explains experiment semantics, Rhino/CAD assumptions, participant-visible behavior, or downstream analysis meaning.
- Keep the Chinese line aligned with the English claim; it should sharpen the meaning, not introduce a different rule.

## Preferred Shape

Use a short section header when a reader needs the mental model before the code:

```ts
// ===== Runtime config assembly =====
// Authoring files are split for generators and package tools; runtime loading
// resolves them once so later modules can work with a single config shape.
// 这里把协议语义收口，后面的模块不再猜这些字段来自 task JSON、asset library 还是行为库。
```

Use inline comments only when the next step would otherwise be easy to misread:

```ts
// Candidate movement is validated before mutation.
// 被试看到的是“动作被挡住”，不是“先移动再弹回去”。
if (wouldCollide(nextPose)) {
  return blocked;
}
```

## Good Examples

```ts
// Runtime object polygons are stored in rendered object-local coordinates.
// collider SVG 可以保留自己的 viewBox；loader 负责把它映射到 0..width / 0..height。
```

```ts
// Preview duration is recorded as a phase metric, but the main task timer
// still follows player start so exported data stays comparable across flows.
// 这会直接影响离线分析对时长字段的解释，所以不要把两个计时口径混在一起。
```

## Bad Examples

```ts
// Set x to point.x.
const x = point.x;
```

```ts
// Check collision.
if (hasCollision) {
```

The bad examples repeat the code but do not explain policy, assumptions, or consequences.

## Do Not

- Do not comment every branch or assignment.
- Do not restate variable names or obvious control flow.
- Do not write speculative comments about features that do not exist yet.
- Do not hide uncertainty inside vague wording like "maybe", "probably", or "for now" when the code already depends on a concrete rule.
- Do not change behavior while adding comments.

## Quick Review Before You Keep a Comment

Ask:

- Will a future maintainer learn a domain rule or boundary from this?
- Would a Rhino/GH package author understand what space, unit, or export assumption the code expects?
- If analysis output depends on this behavior, does the comment say so plainly?

If the answer is no, delete or tighten the comment.
