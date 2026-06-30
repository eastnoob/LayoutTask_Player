import type { CollisionAreaConfig, ViewBox } from "../types/config";
import type { ObjectPose } from "../types/events";
import type { RuntimeTaskObject } from "../types/runtime";
import { normalizeRotation } from "../utils/geometry";

export interface CollisionPoint {
  x: number;
  y: number;
}

export type CollisionPolygon = CollisionPoint[];

/**
 * Collision polygon helpers expect convex polygons. Concave areas should be decomposed
 * into convex polygons before runtime collision evaluation.
 */
export type CollisionResult =
  | { ok: true }
  | { ok: false; reason: "outside_contain"; areaId: string }
  | { ok: false; reason: "blocked_area"; areaId: string }
  | { ok: false; reason: "object"; objectId: string };

export interface EvaluateCollisionInput {
  movingObject: RuntimeTaskObject;
  candidatePose: ObjectPose;
  objects: RuntimeTaskObject[];
  objectPoses?: Record<string, ObjectPose>;
  areas: CollisionAreaConfig[];
  worldViewBox: ViewBox;
}

const EPSILON = 1e-9;

// ===== Collision policy =====
// Collision is intentionally discrete: each candidate pose is accepted or rejected
// as a whole. The runtime does not compute partial slides or "move until touch."
export function evaluateCollision(input: EvaluateCollisionInput): CollisionResult {
  if (!input.movingObject.collision.enabled) {
    return { ok: true };
  }

  const movingPolygons = createObjectCollisionPolygons(input.movingObject, input.candidatePose);
  const containAreas = input.areas.filter((area) => area.type === "contain");
  const blockAreas = input.areas.filter((area) => area.type === "block");
  // contain areas define where an object may stay. If none are authored, the task
  // world viewBox becomes the default allowed room. block areas are obstacles inside it.
  const containPolygons =
    containAreas.length > 0
      ? containAreas.map((area) => ({ id: area.id, polygon: areaToPolygon(area) }))
      : [{ id: "__world_viewBox", polygon: viewBoxToPolygon(input.worldViewBox) }];

  for (const movingPolygon of movingPolygons) {
    const containingArea = containPolygons.find((area) => isPolygonInsidePolygon(movingPolygon, area.polygon));
    if (!containingArea) {
      return { ok: false, reason: "outside_contain", areaId: containPolygons[0]?.id ?? "__world_viewBox" };
    }
  }

  for (const area of blockAreas) {
    const blockPolygon = areaToPolygon(area);
    if (movingPolygons.some((movingPolygon) => doPolygonsIntersect(movingPolygon, blockPolygon))) {
      return { ok: false, reason: "blocked_area", areaId: area.id };
    }
  }

  for (const object of input.objects) {
    if (object.id === input.movingObject.id || !object.collision.enabled) {
      continue;
    }
    const pose = input.objectPoses?.[object.id] ?? { x: object.x, y: object.y, r: object.rotation };
    const objectPolygons = createObjectCollisionPolygons(object, pose);
    if (
      movingPolygons.some((movingPolygon) =>
        objectPolygons.some((objectPolygon) => doPolygonsIntersect(movingPolygon, objectPolygon)),
      )
    ) {
      if (hasSameGroupId(input.movingObject, object) && wasAlreadyOverlapping(input, objectPolygons)) {
        continue;
      }
      return { ok: false, reason: "object", objectId: object.id };
    }
  }

  return { ok: true };
}

function hasSameGroupId(a: RuntimeTaskObject, b: RuntimeTaskObject): boolean {
  return a.group_id !== undefined && a.group_id === b.group_id;
}

function wasAlreadyOverlapping(
  input: EvaluateCollisionInput,
  objectPolygons: CollisionPolygon[],
): boolean {
  // ponytail: allow escaping authored same-group overlap; still block newly-created overlap.
  const currentPose = input.objectPoses?.[input.movingObject.id] ?? {
    x: input.movingObject.x,
    y: input.movingObject.y,
    r: input.movingObject.rotation,
  };
  const currentMovingPolygons = createObjectCollisionPolygons(input.movingObject, currentPose);

  return currentMovingPolygons.some((movingPolygon) =>
    objectPolygons.some((objectPolygon) => doPolygonsIntersect(movingPolygon, objectPolygon)),
  );
}

export function createObjectCollisionPolygons(object: RuntimeTaskObject, pose: ObjectPose): CollisionPolygon[] {
  if (object.collision.shape === "box") {
    return [createObjectCollisionPolygon(object, pose)];
  }

  // Polygon padding is intentionally not applied in v1. Authored object-local
  // collider polygons are transformed verbatim to avoid an implicit offset model.
  return object.collision.polygons.map((polygon) => transformObjectLocalPolygon(object, pose, polygon.points));
}

export function createObjectCollisionPolygon(object: RuntimeTaskObject, pose: ObjectPose): CollisionPolygon {
  const padding = object.collision.padding;
  const width = object.width + padding * 2;
  const height = object.height + padding * 2;
  const left = object.anchor === "top_left" ? -padding : -width / 2;
  const top = object.anchor === "top_left" ? -padding : -height / 2;
  const corners = [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
  const angle = (normalizeRotation(pose.r) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return corners.map((point) => ({
    x: pose.x + point.x * cos - point.y * sin,
    y: pose.y + point.x * sin + point.y * cos,
  }));
}

function transformObjectLocalPolygon(
  object: RuntimeTaskObject,
  pose: ObjectPose,
  points: CollisionPolygon,
): CollisionPolygon {
  const originX = object.anchor === "center" ? object.width / 2 : 0;
  const originY = object.anchor === "center" ? object.height / 2 : 0;
  const angle = (normalizeRotation(pose.r) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return points.map((point) => {
    const localX = point.x - originX;
    const localY = point.y - originY;

    return {
      x: pose.x + localX * cos - localY * sin,
      y: pose.y + localX * sin + localY * cos,
    };
  });
}

export function areaToPolygon(area: CollisionAreaConfig): CollisionPolygon {
  if (area.shape === "polygon") {
    return area.points.map((point) => ({ x: point.x, y: point.y }));
  }

  return [
    { x: area.x, y: area.y },
    { x: area.x + area.width, y: area.y },
    { x: area.x + area.width, y: area.y + area.height },
    { x: area.x, y: area.y + area.height },
  ];
}

export function viewBoxToPolygon(viewBox: ViewBox): CollisionPolygon {
  return [
    { x: viewBox.x, y: viewBox.y },
    { x: viewBox.x + viewBox.width, y: viewBox.y },
    { x: viewBox.x + viewBox.width, y: viewBox.y + viewBox.height },
    { x: viewBox.x, y: viewBox.y + viewBox.height },
  ];
}

export function isPolygonInsidePolygon(inner: CollisionPolygon, outer: CollisionPolygon): boolean {
  return inner.every((point) => isPointInsideConvexPolygon(point, outer));
}

export function isPointInsideConvexPolygon(point: CollisionPoint, polygon: CollisionPolygon): boolean {
  let sign = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const cross = crossProduct(a, b, point);

    if (Math.abs(cross) <= EPSILON) {
      continue;
    }

    const currentSign = Math.sign(cross);
    if (sign === 0) {
      sign = currentSign;
      continue;
    }

    if (sign !== currentSign) {
      return false;
    }
  }

  return true;
}

export function doPolygonsIntersect(a: CollisionPolygon, b: CollisionPolygon): boolean {
  return !hasSeparatingAxis(a, b) && !hasSeparatingAxis(b, a);
}

function hasSeparatingAxis(a: CollisionPolygon, b: CollisionPolygon): boolean {
  for (let index = 0; index < a.length; index += 1) {
    const p1 = a[index];
    const p2 = a[(index + 1) % a.length];
    const axis = { x: -(p2.y - p1.y), y: p2.x - p1.x };
    const projectionA = projectPolygon(a, axis);
    const projectionB = projectPolygon(b, axis);

    // Edge contact is allowed because Rhino/CAD layouts often place objects flush
    // with walls or context furniture. Only positive overlap counts as collision.
    if (projectionA.max <= projectionB.min + EPSILON || projectionB.max <= projectionA.min + EPSILON) {
      return true;
    }
  }

  return false;
}

function projectPolygon(polygon: CollisionPolygon, axis: CollisionPoint): { min: number; max: number } {
  const values = polygon.map((point) => point.x * axis.x + point.y * axis.y);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function crossProduct(a: CollisionPoint, b: CollisionPoint, point: CollisionPoint): number {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
}
