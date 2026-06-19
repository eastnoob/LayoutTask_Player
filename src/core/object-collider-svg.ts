export interface ObjectColliderPoint {
  x: number;
  y: number;
}

export interface ObjectColliderPolygon {
  id: string;
  points: ObjectColliderPoint[];
}

const CURVE_SUBDIVISIONS = 12;
const commentPattern = /<!--[\s\S]*?-->/g;
const openingTagPattern = /<(?<tag>[A-Za-z][A-Za-z0-9:-]*)\b(?<attrs>[^>]*)>/g;
const attributePattern = /(?<name>[A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/g;
const pathTokenPattern = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const unsupportedTags = new Set(["image", "use", "mask", "clippath", "filter"]);
const supportedShapeTags = new Set(["rect", "polygon", "path"]);

export function parseObjectColliderSvg(svgText: string): ObjectColliderPolygon[] {
  const polygons: ObjectColliderPolygon[] = [];
  const uncommentedSvgText = svgText.replace(commentPattern, "");

  for (const match of uncommentedSvgText.matchAll(openingTagPattern)) {
    const rawTag = match.groups?.tag;
    const tag = rawTag?.toLowerCase();
    if (!tag || tag.startsWith("/")) {
      continue;
    }

    if (unsupportedTags.has(tag)) {
      throw new Error(`Unsupported object collider SVG element: ${rawTag}`);
    }

    if (!supportedShapeTags.has(tag)) {
      continue;
    }

    const attrs = parseAttributes(match.groups?.attrs ?? "");
    if (!isSolidVisibleShape(attrs)) {
      continue;
    }

    const id = attrs.id || `${tag}_${polygons.length + 1}`;
    if (tag === "rect") {
      polygons.push({ id, points: parseRect(attrs, id) });
      continue;
    }

    if (tag === "polygon") {
      polygons.push({ id, points: parsePolygon(attrs.points ?? "", id) });
      continue;
    }

    polygons.push({ id, points: parsePath(attrs.d ?? "", id) });
  }

  if (polygons.length === 0) {
    throw new Error("Object collider SVG did not contain any supported solid polygons");
  }

  return polygons;
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (const match of raw.matchAll(attributePattern)) {
    const name = match.groups?.name?.toLowerCase();
    const value = match.groups?.double ?? match.groups?.single;
    if (name && value !== undefined) {
      attrs[name] = value;
    }
  }

  return attrs;
}

function isSolidVisibleShape(attrs: Record<string, string>): boolean {
  const style = parseStyle(attrs.style);
  const read = (name: string) => style[name] ?? attrs[name];

  if (read("fill")?.trim().toLowerCase() === "none") {
    return false;
  }

  if (read("display")?.trim().toLowerCase() === "none") {
    return false;
  }

  if (read("visibility")?.trim().toLowerCase() === "hidden") {
    return false;
  }

  if (isZeroOpacity(read("opacity")) || isZeroOpacity(read("fill-opacity"))) {
    return false;
  }

  return true;
}

function parseStyle(raw: string | undefined): Record<string, string> {
  const style: Record<string, string> = {};
  if (!raw) {
    return style;
  }

  for (const declaration of raw.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const name = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (name) {
      style[name] = value;
    }
  }

  return style;
}

function isZeroOpacity(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }

  return Number(raw.trim()) === 0;
}

function parseRect(attrs: Record<string, string>, id: string): ObjectColliderPoint[] {
  const x = readNumber(attrs, "x", id, 0);
  const y = readNumber(attrs, "y", id, 0);
  const width = readPositiveNumber(attrs, "width", id);
  const height = readPositiveNumber(attrs, "height", id);

  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function parsePolygon(raw: string, id: string): ObjectColliderPoint[] {
  const values = raw
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((value) => Number(value));

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Object collider polygon ${id} has invalid points`);
  }

  if (values.length % 2 !== 0) {
    throw new Error(`Object collider polygon ${id} must contain x,y coordinate pairs`);
  }

  const points: ObjectColliderPoint[] = [];
  for (let index = 0; index < values.length; index += 2) {
    points.push({ x: values[index], y: values[index + 1] });
  }

  return requirePolygonPoints(points, `Object collider polygon ${id}`);
}

function parsePath(raw: string, id: string): ObjectColliderPoint[] {
  const tokens = raw.match(pathTokenPattern) ?? [];
  if (tokens.length === 0) {
    throw new Error(`Object collider path ${id} has empty d attribute`);
  }

  const points: ObjectColliderPoint[] = [];
  let index = 0;
  let command = "";
  let current: ObjectColliderPoint = { x: 0, y: 0 };
  let start: ObjectColliderPoint | undefined;
  let closed = false;
  let previousCommand = "";
  let previousCubicControl: ObjectColliderPoint | undefined;
  let previousQuadraticControl: ObjectColliderPoint | undefined;

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index];
      index += 1;
    } else if (!command) {
      throw new Error(`Object collider path ${id} must start with a command`);
    }

    const upperCommand = command.toUpperCase();
    const relative = command !== upperCommand;

    if (upperCommand === "Z") {
      if (hasNumber(tokens, index)) {
        throw new Error(`Object collider path ${id} has unexpected parameters after Z`);
      }
      closed = true;
      previousCommand = command;
      command = "";
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
      continue;
    }

    if (closed) {
      throw new Error(`Object collider path ${id} contains drawing commands after close`);
    }

    if (!["M", "L", "H", "V", "C", "S", "Q", "T"].includes(upperCommand)) {
      throw new Error(`Object collider path ${id} uses unsupported command ${command}`);
    }

    if (upperCommand === "M") {
      const firstPoint = readPathPoint(tokens, index, relative ? current : undefined, id);
      index += 2;
      if (start) {
        throw new Error(`Object collider path ${id} contains multiple subpaths`);
      }

      current = firstPoint;
      start = firstPoint;
      points.push(firstPoint);

      while (hasNumber(tokens, index)) {
        current = readPathPoint(tokens, index, relative ? current : undefined, id);
        index += 2;
        points.push(current);
      }

      previousCommand = command;
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
      continue;
    }

    if (!start) {
      throw new Error(`Object collider path ${id} must start with M`);
    }

    if (upperCommand === "L") {
      while (hasNumber(tokens, index)) {
        current = readPathPoint(tokens, index, relative ? current : undefined, id);
        index += 2;
        points.push(current);
      }
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (upperCommand === "H") {
      while (hasNumber(tokens, index)) {
        const x = readPathNumber(tokens, index, id) + (relative ? current.x : 0);
        index += 1;
        current = { x, y: current.y };
        points.push(current);
      }
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (upperCommand === "V") {
      while (hasNumber(tokens, index)) {
        const y = readPathNumber(tokens, index, id) + (relative ? current.y : 0);
        index += 1;
        current = { x: current.x, y };
        points.push(current);
      }
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (upperCommand === "C") {
      while (hasNumber(tokens, index)) {
        const startPoint = current;
        const control1 = readPathPoint(tokens, index, relative ? current : undefined, id);
        const control2 = readPathPoint(tokens, index + 2, relative ? current : undefined, id);
        const end = readPathPoint(tokens, index + 4, relative ? current : undefined, id);
        index += 6;
        appendCubic(points, startPoint, control1, control2, end);
        current = end;
        previousCubicControl = control2;
        previousQuadraticControl = undefined;
        previousCommand = command;
      }
    } else if (upperCommand === "S") {
      while (hasNumber(tokens, index)) {
        const startPoint = current;
        const control1 =
          previousCommand.toUpperCase() === "C" || previousCommand.toUpperCase() === "S"
            ? reflectPoint(previousCubicControl ?? current, current)
            : current;
        const control2 = readPathPoint(tokens, index, relative ? current : undefined, id);
        const end = readPathPoint(tokens, index + 2, relative ? current : undefined, id);
        index += 4;
        appendCubic(points, startPoint, control1, control2, end);
        current = end;
        previousCubicControl = control2;
        previousQuadraticControl = undefined;
        previousCommand = command;
      }
    } else if (upperCommand === "Q") {
      while (hasNumber(tokens, index)) {
        const startPoint = current;
        const control = readPathPoint(tokens, index, relative ? current : undefined, id);
        const end = readPathPoint(tokens, index + 2, relative ? current : undefined, id);
        index += 4;
        appendQuadratic(points, startPoint, control, end);
        current = end;
        previousQuadraticControl = control;
        previousCubicControl = undefined;
        previousCommand = command;
      }
    } else if (upperCommand === "T") {
      while (hasNumber(tokens, index)) {
        const startPoint = current;
        const control =
          previousCommand.toUpperCase() === "Q" || previousCommand.toUpperCase() === "T"
            ? reflectPoint(previousQuadraticControl ?? current, current)
            : current;
        const end = readPathPoint(tokens, index, relative ? current : undefined, id);
        index += 2;
        appendQuadratic(points, startPoint, control, end);
        current = end;
        previousQuadraticControl = control;
        previousCubicControl = undefined;
        previousCommand = command;
      }
    }

    previousCommand = command;
  }

  if (!closed) {
    throw new Error(`Object collider path ${id} must be closed with Z`);
  }

  return requirePolygonPoints(points, `Object collider path ${id}`);
}

function readNumber(attrs: Record<string, string>, name: string, id: string, defaultValue?: number): number {
  const raw = attrs[name];
  if (raw === "") {
    throw new Error(`Object collider element ${id} has invalid ${name}`);
  }

  const value = raw === undefined && defaultValue !== undefined ? defaultValue : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Object collider element ${id} has invalid ${name}`);
  }

  return value;
}

function readPositiveNumber(attrs: Record<string, string>, name: string, id: string): number {
  const value = readNumber(attrs, name, id);
  if (value <= 0) {
    throw new Error(`Object collider element ${id} requires positive ${name}`);
  }

  return value;
}

function requirePolygonPoints(points: ObjectColliderPoint[], label: string): ObjectColliderPoint[] {
  const withoutClosingDuplicate =
    points.length > 1 && pointsEqual(points[0], points[points.length - 1]) ? points.slice(0, -1) : points;

  if (withoutClosingDuplicate.length < 3) {
    throw new Error(`${label} must contain at least 3 points`);
  }

  return withoutClosingDuplicate;
}

function isCommand(token: string): boolean {
  return /^[AaCcHhLlMmQqSsTtVvZz]$/.test(token);
}

function hasNumber(tokens: string[], index: number): boolean {
  return index < tokens.length && !isCommand(tokens[index]);
}

function readPathNumber(tokens: string[], index: number, id: string): number {
  const token = tokens[index];
  if (token === undefined || isCommand(token)) {
    throw new Error(`Object collider path ${id} has incomplete command parameters`);
  }

  const value = Number(token);
  if (!Number.isFinite(value)) {
    throw new Error(`Object collider path ${id} has invalid numeric parameter`);
  }

  return value;
}

function readPathPoint(
  tokens: string[],
  index: number,
  relativeOrigin: ObjectColliderPoint | undefined,
  id: string,
): ObjectColliderPoint {
  const x = readPathNumber(tokens, index, id);
  const y = readPathNumber(tokens, index + 1, id);

  return {
    x: x + (relativeOrigin?.x ?? 0),
    y: y + (relativeOrigin?.y ?? 0),
  };
}

function appendCubic(
  points: ObjectColliderPoint[],
  start: ObjectColliderPoint,
  control1: ObjectColliderPoint,
  control2: ObjectColliderPoint,
  end: ObjectColliderPoint,
): void {
  for (let step = 1; step <= CURVE_SUBDIVISIONS; step += 1) {
    const t = step / CURVE_SUBDIVISIONS;
    const mt = 1 - t;
    points.push({
      x: mt ** 3 * start.x + 3 * mt ** 2 * t * control1.x + 3 * mt * t ** 2 * control2.x + t ** 3 * end.x,
      y: mt ** 3 * start.y + 3 * mt ** 2 * t * control1.y + 3 * mt * t ** 2 * control2.y + t ** 3 * end.y,
    });
  }
}

function appendQuadratic(
  points: ObjectColliderPoint[],
  start: ObjectColliderPoint,
  control: ObjectColliderPoint,
  end: ObjectColliderPoint,
): void {
  for (let step = 1; step <= CURVE_SUBDIVISIONS; step += 1) {
    const t = step / CURVE_SUBDIVISIONS;
    const mt = 1 - t;
    points.push({
      x: mt ** 2 * start.x + 2 * mt * t * control.x + t ** 2 * end.x,
      y: mt ** 2 * start.y + 2 * mt * t * control.y + t ** 2 * end.y,
    });
  }
}

function reflectPoint(point: ObjectColliderPoint, around: ObjectColliderPoint): ObjectColliderPoint {
  return {
    x: around.x * 2 - point.x,
    y: around.y * 2 - point.y,
  };
}

function pointsEqual(a: ObjectColliderPoint, b: ObjectColliderPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
