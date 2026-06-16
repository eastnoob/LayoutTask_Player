import type { CollisionAreaConfig, CollisionAreaType } from "../types/config";

const collisionElementPattern = /<(?<tag>rect|polygon|path)\b(?<attrs>[^>]*)\/?>/gi;
const attributePattern = /(?<name>[A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/g;

export function parseCollisionSvg(svgText: string): CollisionAreaConfig[] {
  const areas: CollisionAreaConfig[] = [];

  for (const match of svgText.matchAll(collisionElementPattern)) {
    const tag = match.groups?.tag?.toLowerCase();
    const attrs = parseAttributes(match.groups?.attrs ?? "");
    const type = readCollisionType(attrs);

    if (!type) {
      continue;
    }

    const id = attrs.id || `${type}_${areas.length + 1}`;

    if (tag === "path") {
      throw new Error(`Unsupported collision SVG element: path#${id}`);
    }

    if (tag === "rect") {
      areas.push({
        id,
        type,
        shape: "rect",
        x: readNumber(attrs, "x", id, 0),
        y: readNumber(attrs, "y", id, 0),
        width: readPositiveNumber(attrs, "width", id),
        height: readPositiveNumber(attrs, "height", id),
      });
      continue;
    }

    if (tag === "polygon") {
      areas.push({
        id,
        type,
        shape: "polygon",
        points: parsePoints(attrs.points ?? "", id),
      });
    }
  }

  return areas;
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (const match of raw.matchAll(attributePattern)) {
    const name = match.groups?.name;
    const value = match.groups?.double ?? match.groups?.single;
    if (name && value !== undefined) {
      attrs[name] = value;
    }
  }

  return attrs;
}

function readCollisionType(attrs: Record<string, string>): CollisionAreaType | undefined {
  const value = attrs["data-collision"] ?? attrs["data-layout-collision"];
  if (value === "contain" || value === "block") {
    return value;
  }
  return undefined;
}

function readNumber(attrs: Record<string, string>, name: string, id: string, defaultValue?: number): number {
  const raw = attrs[name];
  const value = raw === undefined && defaultValue !== undefined ? defaultValue : Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`Collision element ${id} has invalid ${name}`);
  }

  return value;
}

function readPositiveNumber(attrs: Record<string, string>, name: string, id: string): number {
  const value = readNumber(attrs, name, id);

  if (value <= 0) {
    throw new Error(`Collision element ${id} requires positive ${name}`);
  }

  return value;
}

function parsePoints(raw: string, id: string): Array<{ x: number; y: number }> {
  const points = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => parsePointPair(pair, id));

  if (points.length < 3) {
    throw new Error(`Collision polygon ${id} must contain at least 3 points`);
  }

  return points;
}

function parsePointPair(pair: string, id: string): { x: number; y: number } {
  const values = pair.split(",");
  if (values.length !== 2 || values[0] === "" || values[1] === "") {
    throw new Error(`Collision polygon ${id} has invalid point '${pair}'`);
  }

  const x = Number(values[0]);
  const y = Number(values[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Collision polygon ${id} has invalid point '${pair}'`);
  }

  return { x, y };
}
