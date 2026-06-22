export interface ObjectColliderPoint {
  x: number;
  y: number;
}

export interface ObjectColliderPolygon {
  id: string;
  points: ObjectColliderPoint[];
}

export interface ObjectColliderViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedObjectColliderSvg {
  viewBox?: ObjectColliderViewBox;
  polygons: ObjectColliderPolygon[];
}

interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const CURVE_SUBDIVISIONS = 12;
const commentPattern = /<!--[\s\S]*?-->/g;
const tagPattern = /<(?<closing>\/)?(?<tag>[A-Za-z][A-Za-z0-9:-]*)\b(?<attrs>[^>]*)>/g;
const attributePattern = /(?<name>[A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/g;
const pathTokenPattern = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const transformFunctionPattern = /(?<name>[A-Za-z]+)\s*\((?<args>[^)]*)\)/g;
const ignoredReferenceTags = new Set(["image"]);
const unsupportedTags = new Set(["mask", "clippath", "filter"]);
// defs/symbol/metadata/title/desc hold templates or labels, not rendered solids.
// Ignoring them prevents hidden authoring helpers from turning into colliders.
const ignoredContainerTags = new Set(["defs", "symbol", "metadata", "title", "desc"]);
const supportedShapeTags = new Set(["rect", "polygon", "path"]);
const identityTransform: TransformMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function parseObjectColliderSvg(svgText: string): ObjectColliderPolygon[] {
  return parseObjectColliderSvgDocument(svgText).polygons;
}

// ===== Object collider SVG parser =====
// This parser is deliberately narrow: collider SVGs are analysis/runtime assets,
// not arbitrary artwork. It only accepts the solid geometry subset we author here:
// rect/polygon/closed path shapes, plus sized use references as rect blocks.
// Returned points stay in the collider SVG's own coordinates; the root viewBox is
// returned alongside them so ConfigLoader can map into rendered object-local space.
export function parseObjectColliderSvgDocument(svgText: string): ParsedObjectColliderSvg {
  const polygons: ObjectColliderPolygon[] = [];
  const uncommentedSvgText = svgText.replace(commentPattern, "");
  const groupVisibilityStack: boolean[] = [];
  const groupTransformStack: TransformMatrix[] = [];
  const ignoredContainerStack: string[] = [];
  let viewBox: ObjectColliderViewBox | undefined;

  for (const match of uncommentedSvgText.matchAll(tagPattern)) {
    const rawTag = match.groups?.tag;
    const tag = rawTag?.toLowerCase();
    if (!tag) {
      continue;
    }

    const closing = match.groups?.closing === "/";
    const rawAttrs = match.groups?.attrs ?? "";

    if (ignoredContainerStack.length > 0) {
      if (closing && tag === ignoredContainerStack.at(-1)) {
        ignoredContainerStack.pop();
      } else if (!closing && ignoredContainerTags.has(tag) && !isSelfClosingTag(rawAttrs)) {
        ignoredContainerStack.push(tag);
      }
      continue;
    }

    if (closing) {
      if (tag === "g") {
        groupVisibilityStack.pop();
        groupTransformStack.pop();
      }
      continue;
    }

    const attrs = parseAttributes(rawAttrs);

    if (tag === "svg" && viewBox === undefined && attrs.viewbox !== undefined) {
      viewBox = parseViewBox(attrs.viewbox);
      continue;
    }

    if (ignoredContainerTags.has(tag)) {
      if (!isSelfClosingTag(rawAttrs)) {
        ignoredContainerStack.push(tag);
      }
      continue;
    }

    if (unsupportedTags.has(tag)) {
      throw new Error(`Unsupported object collider SVG element: ${rawTag}`);
    }

    if (ignoredReferenceTags.has(tag)) {
      continue;
    }

    if (tag === "use") {
      const id = attrs.id || `use_${polygons.length + 1}`;
      if (attrs.width === undefined || attrs.height === undefined) {
        continue;
      }

      const transform = multiplyTransforms(
        currentTransform(groupTransformStack),
        parseTransform(attrs, `Object collider element ${id}`),
      );

      if (!isVisible(groupVisibilityStack) || !isSolidVisibleShape(attrs)) {
        continue;
      }

      polygons.push({ id, points: transformPolygon(parseRect(attrs, id), transform) });
      continue;
    }

    if (tag === "g") {
      const id = attrs.id || `group_${groupVisibilityStack.length + 1}`;
      if (!isSelfClosingTag(rawAttrs)) {
        groupVisibilityStack.push(isVisible(groupVisibilityStack) && isSolidVisibleShape(attrs));
        groupTransformStack.push(
          multiplyTransforms(currentTransform(groupTransformStack), parseTransform(attrs, `Object collider group ${id}`)),
        );
      }
      continue;
    }

    if (!supportedShapeTags.has(tag)) {
      continue;
    }

    const id = attrs.id || `${tag}_${polygons.length + 1}`;
    const transform = multiplyTransforms(
      currentTransform(groupTransformStack),
      parseTransform(attrs, `Object collider element ${id}`),
    );

    if (!isVisible(groupVisibilityStack) || !isSolidVisibleShape(attrs)) {
      continue;
    }

    if (tag === "rect") {
      polygons.push({ id, points: transformPolygon(parseRect(attrs, id), transform) });
      continue;
    }

    if (tag === "polygon") {
      polygons.push({ id, points: transformPolygon(parsePolygon(attrs.points ?? "", id), transform) });
      continue;
    }

    polygons.push({ id, points: transformPolygon(parsePath(attrs.d ?? "", id), transform) });
  }

  if (polygons.length === 0) {
    throw new Error("Object collider SVG did not contain any supported solid polygons");
  }

  return { viewBox, polygons };
}

function isVisible(groupVisibilityStack: boolean[]): boolean {
  return groupVisibilityStack.every(Boolean);
}

function isSelfClosingTag(rawAttrs: string): boolean {
  return rawAttrs.trimEnd().endsWith("/");
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

function currentTransform(stack: TransformMatrix[]): TransformMatrix {
  return stack.at(-1) ?? identityTransform;
}

function parseTransform(attrs: Record<string, string>, label: string): TransformMatrix {
  const raw = attrs.transform;
  if (raw === undefined || raw.trim() === "") {
    return identityTransform;
  }

  let transform = identityTransform;
  let previousEnd = 0;

  for (const match of raw.matchAll(transformFunctionPattern)) {
    const index = match.index ?? 0;
    if (raw.slice(previousEnd, index).trim() !== "") {
      throw new Error(`${label} uses unsupported transform`);
    }

    const name = match.groups?.name.toLowerCase();
    const args = parseTransformArgs(match.groups?.args ?? "");
    const next = transformFromFunction(name, args, label);
    transform = multiplyTransforms(transform, next);
    previousEnd = index + match[0].length;
  }

  if (previousEnd === 0 || raw.slice(previousEnd).trim() !== "") {
    throw new Error(`${label} uses unsupported transform`);
  }

  return transform;
}

function parseTransformArgs(raw: string): number[] {
  return raw
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((value) => Number(value));
}

function transformFromFunction(name: string | undefined, args: number[], label: string): TransformMatrix {
  if (name === "matrix" && args.length === 6 && args.every(Number.isFinite)) {
    return { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
  }

  if (name === "translate" && (args.length === 1 || args.length === 2) && args.every(Number.isFinite)) {
    return { a: 1, b: 0, c: 0, d: 1, e: args[0], f: args[1] ?? 0 };
  }

  if (name === "scale" && (args.length === 1 || args.length === 2) && args.every(Number.isFinite)) {
    return { a: args[0], b: 0, c: 0, d: args[1] ?? args[0], e: 0, f: 0 };
  }

  if (name === "rotate" && (args.length === 1 || args.length === 3) && args.every(Number.isFinite)) {
    const radians = (args[0] * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotation = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };

    if (args.length === 1) {
      return rotation;
    }

    return multiplyTransforms(
      multiplyTransforms({ a: 1, b: 0, c: 0, d: 1, e: args[1], f: args[2] }, rotation),
      { a: 1, b: 0, c: 0, d: 1, e: -args[1], f: -args[2] },
    );
  }

  throw new Error(`${label} uses unsupported transform`);
}

function multiplyTransforms(left: TransformMatrix, right: TransformMatrix): TransformMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function transformPolygon(points: ObjectColliderPoint[], transform: TransformMatrix): ObjectColliderPoint[] {
  return points.map((point) => ({
    x: transform.a * point.x + transform.c * point.y + transform.e,
    y: transform.b * point.x + transform.d * point.y + transform.f,
  }));
}

function parseViewBox(raw: string): ObjectColliderViewBox {
  const values = raw
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((value) => Number(value));

  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) {
    throw new Error("Object collider SVG has invalid viewBox");
  }

  return {
    x: values[0],
    y: values[1],
    width: values[2],
    height: values[3],
  };
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
  if (attrs.rx !== undefined || attrs.ry !== undefined) {
    throw new Error(`Object collider rect ${id} uses unsupported rounded corners`);
  }

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
  const tokens = tokenizePath(raw, id);
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

function tokenizePath(raw: string, id: string): string[] {
  const tokens: string[] = [];
  let previousEnd = 0;

  for (const match of raw.matchAll(pathTokenPattern)) {
    const index = match.index ?? 0;
    rejectInvalidPathText(raw.slice(previousEnd, index), id);
    tokens.push(match[0]);
    previousEnd = index + match[0].length;
  }

  rejectInvalidPathText(raw.slice(previousEnd), id);
  return tokens;
}

function rejectInvalidPathText(text: string, id: string): void {
  if (text.trim().replaceAll(",", "") !== "") {
    throw new Error(`Object collider path ${id} has invalid d attribute`);
  }
}

function readNumber(attrs: Record<string, string>, name: string, id: string, defaultValue?: number): number {
  const raw = attrs[name];
  if (raw === "") {
    throw new Error(`Object collider element ${id} has invalid ${name}`);
  }

  const value = raw === undefined && defaultValue !== undefined ? defaultValue : parseSvgNumber(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Object collider element ${id} has invalid ${name}`);
  }

  return value;
}

function parseSvgNumber(raw: string | undefined): number {
  if (raw === undefined) {
    return Number.NaN;
  }

  const trimmed = raw.trim();
  const withoutPx = trimmed.toLowerCase().endsWith("px") ? trimmed.slice(0, -2).trim() : trimmed;
  return Number(withoutPx);
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
