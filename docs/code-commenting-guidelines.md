# Code Commenting Guidelines

This project uses comments for domain meaning, not for TypeScript syntax.

## Audience

- Future experiment author/maintainer.
- Users adapting Rhino/GH exports into Layout Task protocol packages.

## Style

- English first.
- Add Chinese when the comment explains experiment semantics, Rhino/CAD export assumptions, or analysis consequences.
- Prefer short section comments before dense blocks.
- Explain why a rule exists, what coordinate system a value lives in, or what offline analysis will assume.

## Good

```ts
// Runtime object polygons are in rendered object-local coordinates.
// collider SVG 可以用自己的 viewBox；loader 会映射到 0..width / 0..height。
```

## Bad

```ts
// Set x to point.x.
const x = point.x;
```

## Do Not

- Do not add comments to every branch.
- Do not restate variable names.
- Do not document speculative future features.
- Do not change behavior while adding comments.
