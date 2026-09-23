import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { batchSchema } from "../../src/schemas/batch.schema";

const placeholderTaskId = "scene_from_runner";
const legacyDefaultBehaviorTemplate = "drag500_rotate45_limited";
const defaultBehaviorTemplate = "button500_rotate45_limited";
const taskIdSafePattern = /[^A-Za-z0-9_-]+/g;
const defaultColliderSuffix = "_COLLISION";
const blankBackgroundAssetId = "blank_background";
const blankBackgroundSrc = "assets/backgrounds/blank_background.svg";
const blankBackgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>\n`;

const roomPointRhinoY: Record<string, number> = {
  P01: 17500,
  P02: 24500,
  P03: 24500,
  P04: 31500,
  P05: 38500,
  P06: 38500,
};

const roomSvgHeight = 10476;
const authoredStageHeight = 42000;
const roomSlotRows = {
  top: 69,
  rowP05P06: 2135,
  rowP04: 4202,
  rowP02P03: 6269,
  rowP01: 8311,
};

function roomSlotCenterY(topRow: number, bottomRow: number): number {
  return (((topRow + bottomRow) / 2) / roomSvgHeight) * authoredStageHeight;
}

// Treat the current manually verified furniture placements as the canonical
// visual slot centers for this vertical room SVG. The room art is illustrative,
// not a metric Rhino drawing; these offsets are the final calibration that makes
// each group land at the perceived center of its grid cell in the rendered page.
// The vertical offsets form the calibrated slot sequence from top to bottom:
// P05/P06 +2800, P04 +1400, P02/P03 0, P01 -1400. P02/P03 are therefore the
// inferred middle baseline between the upper and lower calibrated rows.
const roomPointVisualCenterOffsetY: Record<string, number> = {
  P01: -1400,
  P02: 0,
  P03: 0,
  P04: 1400,
  P05: 2800,
  P06: 2800,
};

const roomPointDisplayY: Record<string, number> = {
  P01: roomSlotCenterY(roomSlotRows.rowP02P03, roomSlotRows.rowP01) + roomPointVisualCenterOffsetY.P01,
  P02: roomSlotCenterY(roomSlotRows.rowP04, roomSlotRows.rowP02P03) + roomPointVisualCenterOffsetY.P02,
  P03: roomSlotCenterY(roomSlotRows.rowP04, roomSlotRows.rowP02P03) + roomPointVisualCenterOffsetY.P03,
  P04: roomSlotCenterY(roomSlotRows.rowP05P06, roomSlotRows.rowP04) + roomPointVisualCenterOffsetY.P04,
  P05: roomSlotCenterY(roomSlotRows.top, roomSlotRows.rowP05P06) + roomPointVisualCenterOffsetY.P05,
  P06: roomSlotCenterY(roomSlotRows.top, roomSlotRows.rowP05P06) + roomPointVisualCenterOffsetY.P06,
};

const usage = `Usage: tsx protocol/adaptor/assemble-stimuli-csv.ts --csv <file> --out <dir> --experiment-id <id> [--title <title>] [--trust-svg-viewbox] [--svg-viewbox-scale <number>] [--attach-collider-svg] [--collider-suffix <suffix>] [--rebuild-objects-from-scene-state] [--map-y-to-room-points] [--blank-background] [--display-flip-y] [--background-flip-y] [--rhino-y-up-to-svg-y-down] [--rhino-y-affine-offset <number>] [--rhino-y-affine-scale <number>]`;

interface CliArgs {
  csv?: string;
  out?: string;
  experimentId?: string;
  title: string;
  trustSvgViewBox: boolean;
  svgViewBoxScale: number;
  attachColliderSvg: boolean;
  colliderSuffix: string;
  rebuildObjectsFromSceneState: boolean;
  mapYToRoomPoints: boolean;
  blankBackground: boolean;
  displayFlipY: boolean;
  backgroundFlipY: boolean;
  rhinoYUpToSvgYDown: boolean;
  rhinoYAffineOffset?: number;
  rhinoYAffineScale?: number;
}

interface YTransform {
  offset?: number;
  scale?: number;
}

type CsvRow = Record<string, string | undefined>;
type JsonObject = Record<string, unknown>;

interface OutputFile {
  target: string;
  value: unknown;
}

export function collisionConfigForColliderAttachment(attachColliderSvg: boolean): JsonObject | undefined {
  if (!attachColliderSvg) {
    return undefined;
  }

  return {
    enabled: true,
    mode: "discrete",
    areas: [],
  };
}

export function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => jsonValuesEqual(item, right[index]));
  }

  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) ||
    Array.isArray(right)
  ) {
    return false;
  }

  const leftEntries = Object.entries(left as JsonObject).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  const rightEntries = Object.entries(right as JsonObject).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value], index) => {
    const [rightKey, rightValue] = rightEntries[index];
    return key === rightKey && jsonValuesEqual(value, rightValue);
  });
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

export function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = {
    title: "",
    trustSvgViewBox: false,
    svgViewBoxScale: 1,
    attachColliderSvg: false,
    colliderSuffix: defaultColliderSuffix,
    rebuildObjectsFromSceneState: false,
    mapYToRoomPoints: false,
    blankBackground: false,
    displayFlipY: false,
    backgroundFlipY: false,
    rhinoYUpToSvgYDown: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--csv") {
      parsed.csv = requireValue(args, index, "--csv");
      index += 1;
      continue;
    }

    if (arg.startsWith("--csv=")) {
      parsed.csv = arg.slice("--csv=".length);
      continue;
    }

    if (arg === "--out") {
      parsed.out = requireValue(args, index, "--out");
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      parsed.out = arg.slice("--out=".length);
      continue;
    }

    if (arg === "--experiment-id") {
      parsed.experimentId = requireValue(args, index, "--experiment-id");
      index += 1;
      continue;
    }

    if (arg.startsWith("--experiment-id=")) {
      parsed.experimentId = arg.slice("--experiment-id=".length);
      continue;
    }

    if (arg === "--title") {
      parsed.title = requireValue(args, index, "--title");
      index += 1;
      continue;
    }

    if (arg.startsWith("--title=")) {
      parsed.title = arg.slice("--title=".length);
      continue;
    }

    if (arg === "--trust-svg-viewbox") {
      parsed.trustSvgViewBox = true;
      continue;
    }

    if (arg === "--svg-viewbox-scale") {
      parsed.svgViewBoxScale = Number(requireValue(args, index, "--svg-viewbox-scale"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--svg-viewbox-scale=")) {
      parsed.svgViewBoxScale = Number(arg.slice("--svg-viewbox-scale=".length));
      continue;
    }

    if (arg === "--attach-collider-svg") {
      parsed.attachColliderSvg = true;
      continue;
    }

    if (arg === "--collider-suffix") {
      parsed.colliderSuffix = requireValue(args, index, "--collider-suffix");
      index += 1;
      continue;
    }

    if (arg.startsWith("--collider-suffix=")) {
      parsed.colliderSuffix = arg.slice("--collider-suffix=".length);
      continue;
    }

    if (arg === "--rebuild-objects-from-scene-state") {
      parsed.rebuildObjectsFromSceneState = true;
      continue;
    }

    if (arg === "--map-y-to-room-points") {
      parsed.mapYToRoomPoints = true;
      continue;
    }

    if (arg === "--blank-background") {
      parsed.blankBackground = true;
      continue;
    }

    if (arg === "--display-flip-y") {
      parsed.displayFlipY = true;
      continue;
    }

    if (arg === "--background-flip-y") {
      parsed.backgroundFlipY = true;
      continue;
    }

    if (arg === "--rhino-y-up-to-svg-y-down") {
      parsed.rhinoYUpToSvgYDown = true;
      continue;
    }

    if (arg === "--rhino-y-affine-offset") {
      parsed.rhinoYAffineOffset = Number(requireValue(args, index, "--rhino-y-affine-offset"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--rhino-y-affine-offset=")) {
      parsed.rhinoYAffineOffset = Number(arg.slice("--rhino-y-affine-offset=".length));
      continue;
    }

    if (arg === "--rhino-y-affine-scale") {
      parsed.rhinoYAffineScale = Number(requireValue(args, index, "--rhino-y-affine-scale"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--rhino-y-affine-scale=")) {
      parsed.rhinoYAffineScale = Number(arg.slice("--rhino-y-affine-scale=".length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isFinite(parsed.svgViewBoxScale) || parsed.svgViewBoxScale <= 0) {
    throw new Error("--svg-viewbox-scale must be a positive number");
  }

  if (parsed.rhinoYAffineOffset !== undefined || parsed.rhinoYAffineScale !== undefined) {
    if (!parsed.rhinoYUpToSvgYDown) {
      throw new Error("--rhino-y-affine-* requires --rhino-y-up-to-svg-y-down");
    }
    if (!Number.isFinite(parsed.rhinoYAffineOffset) || !Number.isFinite(parsed.rhinoYAffineScale)) {
      throw new Error("--rhino-y-affine-offset and --rhino-y-affine-scale must both be finite numbers");
    }
  }

  return parsed;
}

function getCell(row: CsvRow, name: string, defaultValue = ""): string {
  for (const key of [name, `metric_${name}`]) {
    const value = row[key]?.trim();
    if (value) {
      return value;
    }
  }

  return defaultValue;
}

function parseJsonCell(row: CsvRow, name: string, required = true): JsonObject | undefined {
  const value = getCell(row, name);

  if (!value) {
    if (required) {
      throw new Error(`Missing required column value: ${name}`);
    }
    return undefined;
  }

  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Column ${name} must contain a JSON object`);
  }

  return parsed as JsonObject;
}

function safeTaskId(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim() || fallback;
  const cleaned = raw.replace(taskIdSafePattern, "_").replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function rowTaskId(row: CsvRow, rowIndex: number): string {
  for (const key of ["CombinationId", "combination_id", "RowIndex", "row_index"]) {
    const value = row[key]?.trim();
    if (value) {
      return `scene_${safeTaskId(value, String(rowIndex).padStart(6, "0"))}`;
    }
  }

  return `scene_${String(rowIndex).padStart(6, "0")}`;
}

function replaceScenePlaceholder(value: unknown, taskId: string): unknown {
  if (typeof value === "string") {
    return value.replaceAll(placeholderTaskId, taskId);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceScenePlaceholder(item, taskId));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject).map(([key, item]) => [key, replaceScenePlaceholder(item, taskId)]),
    );
  }

  return value;
}

function withDefaultWorldUnits(world: unknown): unknown {
  if (!world || typeof world !== "object" || Array.isArray(world)) {
    return world;
  }

  return {
    unit: "mm",
    coordinate_source: "rhino",
    unit_scale: 1,
    ...(world as JsonObject),
  };
}

function extractSharedWorld(trials: JsonObject[]): unknown {
  const trialsWithWorld = trials.filter((trial) => trial.world && typeof trial.world === "object");

  if (trialsWithWorld.length === 0) {
    return undefined;
  }

  const normalized = trialsWithWorld.map((trial) => withDefaultWorldUnits(trial.world));
  const [first] = normalized;
  const allEqual = normalized.every((world) => jsonValuesEqual(world, first));

  if (allEqual) {
    for (const trial of trials) {
      delete trial.world;
    }
    return first;
  }

  for (let index = 0; index < trialsWithWorld.length; index += 1) {
    trialsWithWorld[index].world = normalized[index];
  }

  return undefined;
}

function mergeLibraryObjects(target: JsonObject, source: unknown, label: string): void {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return;
  }

  for (const [key, value] of Object.entries(source as JsonObject)) {
    if (Object.hasOwn(target, key)) {
      if (!jsonValuesEqual(target[key], value)) {
        throw new Error(`Conflicting ${label} asset definition for key: ${key}`);
      }
      continue;
    }

    target[key] = value;
  }
}

function displayImageFromRow(row: CsvRow): string {
  for (const key of ["stimulus_image_perspective", "display_image_src", "IMG"]) {
    const value = getCell(row, key);
    if (value) {
      return value.replaceAll("\\", "/");
    }
  }

  return "";
}

function applyDisplayImage(trial: JsonObject, imageSrc: string): void {
  if (!imageSrc) {
    return;
  }

  const existing = trial.display_image && typeof trial.display_image === "object" ? (trial.display_image as JsonObject) : {};
  const displayImage: JsonObject = {
    enabled: true,
    src: imageSrc,
    alt: existing.alt ?? "Reference image",
  };

  if (Object.hasOwn(existing, "record_metrics")) {
    displayImage.record_metrics = existing.record_metrics;
  }

  trial.display_image = displayImage;
}

function staticContextBehavior(): JsonObject {
  return {
    config: {
      movement: { mode: "none" },
      free_drag: { enabled: false },
    },
  };
}

function placementPose(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Scene-state placement is missing ${label}`);
  }

  const pose = value as JsonObject;
  for (const key of ["x", "y", "rotation_deg"]) {
    if (typeof pose[key] !== "number" || !Number.isFinite(pose[key])) {
      throw new Error(`Scene-state placement ${label}.${key} must be a finite number`);
    }
  }

  return pose;
}

function assetDimensionRecord(sceneState: JsonObject, modelId: string): JsonObject {
  const assetDimensions = sceneState.asset_dimensions;
  if (!assetDimensions || typeof assetDimensions !== "object" || Array.isArray(assetDimensions)) {
    throw new Error("Scene-state JSON is missing asset_dimensions");
  }

  const record = (assetDimensions as JsonObject)[modelId];
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Scene-state JSON is missing asset_dimensions.${modelId}`);
  }

  return record as JsonObject;
}

function placementRelativeTarget(placement: JsonObject): JsonObject {
  const state =
    placement.variable_state && typeof placement.variable_state === "object" && !Array.isArray(placement.variable_state)
      ? (placement.variable_state as JsonObject)
      : placement.final_state_json &&
          typeof placement.final_state_json === "object" &&
          !Array.isArray(placement.final_state_json) &&
          (placement.final_state_json as JsonObject).variable_group &&
          typeof (placement.final_state_json as JsonObject).variable_group === "object" &&
          !Array.isArray((placement.final_state_json as JsonObject).variable_group)
        ? ((placement.final_state_json as JsonObject).variable_group as JsonObject)
        : undefined;

  if (!state) {
    throw new Error("Scene-state placement is missing variable_state");
  }

  for (const key of ["dx_steps", "dy_steps", "rotation_steps"]) {
    if (typeof state[key] !== "number" || !Number.isFinite(state[key])) {
      throw new Error(`Scene-state placement variable_state.${key} must be a finite number`);
    }
  }

  return {
    dx_steps: state.dx_steps,
    dy_steps: state.dy_steps,
    rotation_steps: state.rotation_steps,
    frame: "placed_group_local",
  };
}

export function rebuildTrialObjectsFromSceneState(trial: JsonObject, sceneState: JsonObject): void {
  const placements = sceneState.placements;
  if (!Array.isArray(placements)) {
    throw new Error("Scene-state JSON is missing placements");
  }

  const taskId = String(trial.task_id ?? placeholderTaskId);
  trial.objects = placements.map((placementValue) => {
    if (!placementValue || typeof placementValue !== "object" || Array.isArray(placementValue)) {
      throw new Error("Scene-state placement must be an object");
    }

    const placement = placementValue as JsonObject;
    const modelId = String(placement.model_id ?? "").trim();
    if (!modelId) {
      throw new Error("Scene-state placement is missing model_id");
    }

    const modelKey = modelId.toLowerCase();
    const assetRecord = assetDimensionRecord(sceneState, modelId);
    const groupAsset = String(assetRecord.group_asset ?? `${modelKey}_group`);
    const variableAsset = String(assetRecord.variable_asset ?? `${modelKey}_variable`);
    const groupPose = placementPose(placement.group_pose, "group_pose");
    const initialPose = placementPose(placement.variable_initial_pose, "variable_initial_pose");
    const correctPose = placementPose(placement.variable_correct_pose, "variable_correct_pose");
    const groupId = `${taskId}_${modelKey}`;

    return [
      {
        id: `${groupId}_group`,
        role: "fixed",
        group_id: groupId,
        asset: groupAsset,
        x: groupPose.x,
        y: groupPose.y,
        rotation: groupPose.rotation_deg,
        initial: { x: groupPose.x, y: groupPose.y, rotation_deg: groupPose.rotation_deg },
        anchor: "center",
        behavior: staticContextBehavior(),
      },
      {
        id: `${groupId}_variable`,
        role: "variable",
        group_id: groupId,
        asset: variableAsset,
        x: initialPose.x,
        y: initialPose.y,
        rotation: initialPose.rotation_deg,
        initial: { x: initialPose.x, y: initialPose.y, rotation_deg: initialPose.rotation_deg },
        anchor: "center",
        behavior: { template: defaultBehaviorTemplate },
        initial_state_label: String(placement.variable_state_label ?? "scene-state-initial"),
        target: {
          relative: placementRelativeTarget(placement),
          absolute: { x: correctPose.x, y: correctPose.y, rotation_deg: correctPose.rotation_deg },
        },
      },
    ];
  }).flat();
}

function mapPoseYToRoomPointDisplay(pose: JsonObject, pointId: string, world: JsonObject): JsonObject {
  const rhinoPointY = roomPointRhinoY[pointId];
  const displayPointY = roomPointDisplayY[pointId];
  const viewBox = world.viewBox as JsonObject | undefined;
  const viewBoxY = Number(viewBox?.y ?? 0);
  const viewBoxHeight = Number(viewBox?.height);

  if (!Number.isFinite(rhinoPointY) || !Number.isFinite(displayPointY)) {
    throw new Error(`Cannot map room point y for unknown point_id: ${pointId}`);
  }
  if (!Number.isFinite(viewBoxHeight)) {
    throw new Error("Cannot map room point y without world.viewBox.height");
  }

  const y = Number(pose.y);
  const displayY = displayPointY - (y - rhinoPointY);
  return {
    ...pose,
    y: viewBoxY * 2 + viewBoxHeight - displayY,
  };
}

export function mapTrialObjectYToRoomPoints(trial: JsonObject, sceneState: JsonObject): void {
  const placements = sceneState.placements;
  const world = trial.world;
  if (!Array.isArray(placements)) {
    throw new Error("Scene-state JSON is missing placements");
  }
  if (!world || typeof world !== "object" || Array.isArray(world)) {
    throw new Error("Cannot map room point y without trial.world");
  }

  const taskId = String(trial.task_id ?? placeholderTaskId);
  for (const placementValue of placements) {
    if (!placementValue || typeof placementValue !== "object" || Array.isArray(placementValue)) {
      continue;
    }

    const placement = placementValue as JsonObject;
    const modelId = String(placement.model_id ?? "").trim();
    const pointId = String(placement.point_id ?? "").trim();
    if (!modelId || !pointId) {
      continue;
    }

    const modelKey = modelId.toLowerCase();
    const groupId = `${taskId}_${modelKey}`;
    const groupObject = Array.isArray(trial.objects)
      ? trial.objects.find((object) => object && typeof object === "object" && (object as JsonObject).id === `${groupId}_group`)
      : undefined;
    const variableObject = Array.isArray(trial.objects)
      ? trial.objects.find((object) => object && typeof object === "object" && (object as JsonObject).id === `${groupId}_variable`)
      : undefined;

    if (groupObject && typeof groupObject === "object") {
      const mapped = mapPoseYToRoomPointDisplay(placementPose(placement.group_pose, "group_pose"), pointId, world as JsonObject);
      const objectConfig = groupObject as JsonObject;
      objectConfig.y = mapped.y;
      if (objectConfig.initial && typeof objectConfig.initial === "object" && !Array.isArray(objectConfig.initial)) {
        (objectConfig.initial as JsonObject).y = mapped.y;
      }
    }

    if (variableObject && typeof variableObject === "object") {
      const mappedInitial = mapPoseYToRoomPointDisplay(
        placementPose(placement.variable_initial_pose, "variable_initial_pose"),
        pointId,
        world as JsonObject,
      );
      const mappedCorrect = mapPoseYToRoomPointDisplay(
        placementPose(placement.variable_correct_pose, "variable_correct_pose"),
        pointId,
        world as JsonObject,
      );
      const objectConfig = variableObject as JsonObject;
      objectConfig.y = mappedInitial.y;
      if (objectConfig.initial && typeof objectConfig.initial === "object" && !Array.isArray(objectConfig.initial)) {
        (objectConfig.initial as JsonObject).y = mappedInitial.y;
      }
      const target = objectConfig.target;
      if (target && typeof target === "object" && !Array.isArray(target)) {
        const absolute = (target as JsonObject).absolute;
        if (absolute && typeof absolute === "object" && !Array.isArray(absolute)) {
          (absolute as JsonObject).y = mappedCorrect.y;
        }
      }
    }
  }
}

function normalizeDefaultBehaviorTemplate(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDefaultBehaviorTemplate(item));
  }

  if (value && typeof value === "object") {
    const normalized = Object.fromEntries(
      Object.entries(value as JsonObject).map(([key, item]) => [key, normalizeDefaultBehaviorTemplate(item)]),
    );

    if (normalized.template === legacyDefaultBehaviorTemplate) {
      normalized.template = defaultBehaviorTemplate;
    }

    return normalized;
  }

  return value;
}

function defaultBehaviorLibrary(): JsonObject {
  return {
    schema: "layouttask.behaviors.v1",
    behaviors: {
      [defaultBehaviorTemplate]: {
        movement: {
          mode: "button",
          step: 500,
          max_left: 2,
          max_right: 2,
          max_up: 2,
          max_down: 2,
        },
        rotation: {
          step: 45,
          max_cw: 2,
          max_ccw: 2,
        },
        free_drag: {
          enabled: false,
          snap: true,
        },
      },
    },
  };
}

function isSvgAsset(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const asset = value as JsonObject;
  const type = String(asset.type ?? "").toLowerCase();
  const src = String(asset.src ?? "").toLowerCase().split(/[?#]/, 1)[0];
  return type === "svg" || src.endsWith(".svg");
}

export function colliderSrcForObjectSrc(src: string, colliderSuffix: string): string | undefined {
  const normalizedSrc = src.replaceAll("\\", "/").split(/[?#]/, 1)[0];
  const fileName = normalizedSrc.split("/").pop() ?? "";
  const stem = fileName.replace(/\.svg$/i, "");

  if (!stem || stem === fileName) {
    return undefined;
  }

  return `assets/collision/objects/${stem}${colliderSuffix}.svg`;
}

function colliderSourceFromObjectAsset(asset: unknown, colliderSuffix: string): string | undefined {
  if (!isSvgAsset(asset)) {
    return undefined;
  }

  return colliderSrcForObjectSrc(String((asset as JsonObject).src ?? ""), colliderSuffix);
}

function shouldAttachCollider(collision: unknown): boolean {
  if (collision === undefined) {
    return true;
  }

  if (!collision || typeof collision !== "object" || Array.isArray(collision)) {
    return false;
  }

  const config = collision as JsonObject;
  if (config.enabled === false) {
    return false;
  }

  return config.shape === undefined || config.shape === "box";
}

function withColliderCollision(collision: unknown, colliderSrc: string): JsonObject {
  const existing = collision && typeof collision === "object" && !Array.isArray(collision) ? (collision as JsonObject) : {};

  return {
    ...existing,
    enabled: existing.enabled ?? true,
    shape: "asset_outline",
    source: { type: "svg", src: colliderSrc },
  };
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function transformYInViewBox(y: number, world: JsonObject, yTransform: YTransform = {}): number {
  if (yTransform.offset !== undefined && yTransform.scale !== undefined) {
    return yTransform.offset + yTransform.scale * y;
  }

  const viewBox = world.viewBox as JsonObject | undefined;
  if (!viewBox) {
    throw new Error("Cannot apply --rhino-y-up-to-svg-y-down without world.viewBox");
  }

  const viewBoxY = Number(viewBox.y);
  const viewBoxHeight = Number(viewBox.height);
  if (!Number.isFinite(viewBoxY) || !Number.isFinite(viewBoxHeight)) {
    throw new Error("Cannot apply --rhino-y-up-to-svg-y-down with invalid world.viewBox");
  }

  return viewBoxY * 2 + viewBoxHeight - y;
}

function transformRelativeTarget(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  const relative = value as JsonObject;
  if (typeof relative.dy_steps === "number") {
    relative.dy_steps = -relative.dy_steps;
  }
  if (typeof relative.rotation_steps === "number") {
    relative.rotation_steps = -relative.rotation_steps;
  }
}

function transformAbsoluteTarget(value: unknown, world: JsonObject, yTransform: YTransform): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  const absolute = value as JsonObject;
  if (typeof absolute.y === "number") {
    absolute.y = transformYInViewBox(absolute.y, world, yTransform);
  }
  if (typeof absolute.rotation_deg === "number") {
    absolute.rotation_deg = normalizeRotation(-absolute.rotation_deg);
  }
}

export function transformRhinoYUpTrialToSvgYDown(trial: JsonObject, world: unknown, yTransform: YTransform = {}): void {
  if (!world || typeof world !== "object" || Array.isArray(world)) {
    throw new Error("Cannot apply --rhino-y-up-to-svg-y-down without a resolved world");
  }

  const worldConfig = world as JsonObject;
  const objects = Array.isArray(trial.objects) ? trial.objects : [];
  for (const object of objects) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      continue;
    }

    const objectConfig = object as JsonObject;
    if (typeof objectConfig.y === "number") {
      objectConfig.y = transformYInViewBox(objectConfig.y, worldConfig, yTransform);
    }
    if (typeof objectConfig.rotation === "number") {
      objectConfig.rotation = normalizeRotation(-objectConfig.rotation);
    }

    const initial = objectConfig.initial;
    if (initial && typeof initial === "object" && !Array.isArray(initial)) {
      const initialConfig = initial as JsonObject;
      if (typeof initialConfig.y === "number") {
        initialConfig.y = transformYInViewBox(initialConfig.y, worldConfig, yTransform);
      }
      if (typeof initialConfig.rotation_deg === "number") {
        initialConfig.rotation_deg = normalizeRotation(-initialConfig.rotation_deg);
      }
    }

    const target = objectConfig.target;
    if (target && typeof target === "object" && !Array.isArray(target)) {
      transformRelativeTarget((target as JsonObject).relative);
      transformAbsoluteTarget((target as JsonObject).absolute, worldConfig, yTransform);
    }
  }
}

export function useBlankBackground(trial: JsonObject): void {
  const background = trial.background;
  if (!background || typeof background !== "object" || Array.isArray(background)) {
    throw new Error("Cannot apply --blank-background without trial.background");
  }

  (background as JsonObject).asset = blankBackgroundAssetId;
}

export function attachColliderSvgToTrialObjects(
  trial: JsonObject,
  objectAssets: JsonObject,
  colliderSuffix: string,
): void {
  // Collider sidecars are packaging metadata only: assembly records the expected
  // copied path under `assets/collision/objects/...`, but it does not require the
  // sidecar file to exist yet. Missing sidecars should not fail CSV -> batch
  // assembly, because authors often assemble the protocol package before the
  // collider export/copy step runs.
  // 缺失 sidecar 不在这里报错，方便作者先组装协议包，再由 compile/runtime 校验最终资产是否齐全。
  const objects = Array.isArray(trial.objects) ? trial.objects : [];

  for (const object of objects) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      continue;
    }

    const objectConfig = object as JsonObject;
    if (!shouldAttachCollider(objectConfig.collision)) {
      continue;
    }

    const assetKey = String(objectConfig.asset ?? "");
    const colliderSrc = colliderSourceFromObjectAsset(objectAssets[assetKey], colliderSuffix);
    if (!colliderSrc) {
      continue;
    }

    objectConfig.collision = withColliderCollision(objectConfig.collision, colliderSrc);
  }
}

function stripSvgAssetDimensions(assets: JsonObject): void {
  for (const asset of Object.values(assets)) {
    if (!isSvgAsset(asset)) {
      continue;
    }

    delete (asset as JsonObject).default_width;
    delete (asset as JsonObject).default_height;
  }
}

function applySvgViewBoxScale(assets: JsonObject, scale: number): void {
  if (scale === 1) {
    return;
  }

  for (const asset of Object.values(assets)) {
    if (!isSvgAsset(asset)) {
      continue;
    }

    (asset as JsonObject).viewbox_scale = scale;
  }
}

function stripTrialSvgDimensions(trial: JsonObject, objectAssets: JsonObject, backgroundAssets: JsonObject): void {
  const objects = Array.isArray(trial.objects) ? trial.objects : [];
  for (const object of objects) {
    if (!object || typeof object !== "object" || Array.isArray(object)) {
      continue;
    }

    const objectConfig = object as JsonObject;
    const assetKey = String(objectConfig.asset ?? "");
    if (isSvgAsset(objectAssets[assetKey])) {
      delete objectConfig.width;
      delete objectConfig.height;
    }
  }

  if (!trial.background || typeof trial.background !== "object" || Array.isArray(trial.background)) {
    return;
  }

  const background = trial.background as JsonObject;
  const assetKey = String(background.asset ?? "");
  if (!isSvgAsset(backgroundAssets[assetKey])) {
    return;
  }

  delete background.x;
  delete background.y;
  delete background.width;
  delete background.height;
}

function assemble(
  rows: CsvRow[],
  experimentId: string,
  title: string,
  trustSvgViewBox: boolean,
  svgViewBoxScale: number,
  attachColliderSvg: boolean,
  colliderSuffix: string,
  rebuildObjectsFromSceneState: boolean,
  mapYToRoomPoints: boolean,
  blankBackground: boolean,
  displayFlipY: boolean,
  backgroundFlipY: boolean,
  rhinoYUpToSvgYDown: boolean,
  yTransform: YTransform,
): {
  batch: JsonObject;
  objectLibrary: JsonObject;
  backgroundLibrary: JsonObject;
  behaviorLibrary: JsonObject;
} {
  // ===== Stimuli CSV -> protocol batch =====
  // Rhino/GH Stimuli CSV rows may contain many helper / analysis columns, but the
  // Player protocol source of truth is `metric_trial_protocol_json` (or the
  // unprefixed `trial_protocol_json`, which this adaptor reads via `getCell`).
  // This adaptor does not reinterpret experiment logic. It packages each authored
  // task JSON into one Player batch trial, merges row-level asset libraries into
  // shared `assets/*.json` catalogs, and fills package-path details such as
  // `assets/objects/...`, `assets/backgrounds/...`, and optional collider sidecars.
  const trials: JsonObject[] = [];
  const objectAssets: JsonObject = {};
  const backgroundAssets: JsonObject = {};

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const protocolStatus = (getCell(row, "protocol_status") || "ok").trim().toLowerCase();

    if (protocolStatus && protocolStatus !== "ok") {
      throw new Error(`Row ${rowNumber} has protocol_status=${JSON.stringify(protocolStatus)}: ${getCell(row, "protocol_notes")}`);
    }

    const taskId = rowTaskId(row, rowNumber);
    // Preserve protocol-authored answers as-is: the adaptor should not rewrite
    // scoring semantics such as `target.relative`, or invent `target.absolute`.
    const parsedTrial = parseJsonCell(row, "trial_protocol_json");
    let trial = replaceScenePlaceholder(parsedTrial, taskId) as JsonObject;

    if (!trial.task_id || trial.task_id === placeholderTaskId) {
      trial.task_id = taskId;
    }

    if (!trial.qid || trial.qid === "Q_FROM_RUNNER") {
      trial.qid = `Q_${taskId}`;
    }

    applyDisplayImage(trial, displayImageFromRow(row));
    trial = normalizeDefaultBehaviorTemplate(trial) as JsonObject;
    const sceneState = parseJsonCell(row, "scene_state_json", false);
    if (rebuildObjectsFromSceneState) {
      if (!sceneState) {
        throw new Error(`Row ${rowNumber} is missing scene_state_json`);
      }
      rebuildTrialObjectsFromSceneState(trial, sceneState);
      if (mapYToRoomPoints) {
        mapTrialObjectYToRoomPoints(trial, sceneState);
      }
    } else if (mapYToRoomPoints) {
      throw new Error("--map-y-to-room-points requires --rebuild-objects-from-scene-state");
    }

    const objectLibrary = parseJsonCell(row, "object_assets_json");
    const backgroundLibrary = parseJsonCell(row, "background_assets_json");
    if (trustSvgViewBox) {
      stripSvgAssetDimensions((objectLibrary?.objects ?? {}) as JsonObject);
      applySvgViewBoxScale((objectLibrary?.objects ?? {}) as JsonObject, svgViewBoxScale);
      applySvgViewBoxScale((backgroundLibrary?.backgrounds ?? {}) as JsonObject, svgViewBoxScale);
      stripTrialSvgDimensions(
        trial,
        (objectLibrary?.objects ?? {}) as JsonObject,
        (backgroundLibrary?.backgrounds ?? {}) as JsonObject,
      );
    }
    mergeLibraryObjects(objectAssets, objectLibrary?.objects, "object");
    mergeLibraryObjects(backgroundAssets, backgroundLibrary?.backgrounds, "background");
    if (blankBackground) {
      useBlankBackground(trial);
    }
    if (attachColliderSvg) {
      attachColliderSvgToTrialObjects(trial, (objectLibrary?.objects ?? {}) as JsonObject, colliderSuffix);
    }
    if (rhinoYUpToSvgYDown) {
      transformRhinoYUpTrialToSvgYDown(trial, trial.world, yTransform);
    }
    trials.push(trial);
  });

  const stage: JsonObject = { fit: "contain", max_height_ratio: 0.72, padding: 16 };
  if (displayFlipY) {
    stage.display_flip_y = true;
  }
  if (backgroundFlipY) {
    stage.background_flip_y = true;
  }

  const shared: JsonObject = {
    asset_library: "assets/objects.json",
    background_library: "assets/backgrounds.json",
    behavior_library: "behaviors/behaviors.json",
    flow: { mode: "direct_reconstruction" },
    stage,
  };
  const collision = collisionConfigForColliderAttachment(attachColliderSvg);
  if (collision !== undefined) {
    shared.collision = collision;
  }
  const sharedWorld = extractSharedWorld(trials);
  if (sharedWorld !== undefined) {
    shared.world = sharedWorld;
  }

  const batch: JsonObject = {
    schema: "layouttask.batch.v1",
    experiment_id: experimentId,
    title,
    shared,
    trials,
  };

  return {
    batch,
    objectLibrary: {
      schema: "layouttask.assets.objects.v1",
      objects: objectAssets,
    },
    backgroundLibrary: {
      schema: "layouttask.assets.backgrounds.v1",
      backgrounds: blankBackground
        ? {
            ...backgroundAssets,
            [blankBackgroundAssetId]: {
              type: "svg",
              src: blankBackgroundSrc,
              intrinsic_unit: "cad_unit",
            },
          }
        : backgroundAssets,
    },
    behaviorLibrary: defaultBehaviorLibrary(),
  };
}

function isInside(root: string, target: string): boolean {
  const relativeToRoot = path.relative(root, target);
  return relativeToRoot === "" || (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot));
}

function resolveOutputFile(outDir: string, relativeFile: string, value: unknown): OutputFile {
  const root = path.resolve(outDir);
  const target = path.resolve(root, relativeFile);

  if (!isInside(root, target)) {
    throw new Error(`Refusing to write outside output directory: ${relativeFile}`);
  }

  return { target, value };
}

async function writeJsonFile(file: OutputFile): Promise<void> {
  await mkdir(path.dirname(file.target), { recursive: true });
  await writeFile(file.target, `${JSON.stringify(file.value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  let args: CliArgs;

  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  if (!args.csv || !args.out || !args.experimentId) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  try {
    const raw = await readFile(args.csv, "utf8");
    const rows = parse(raw, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
    }) as CsvRow[];

    if (rows.length === 0) {
      throw new Error("CSV has no data rows.");
    }

    const assembled = assemble(
      rows,
      args.experimentId,
      args.title,
      args.trustSvgViewBox,
      args.svgViewBoxScale,
      args.attachColliderSvg,
      args.colliderSuffix,
      args.rebuildObjectsFromSceneState,
      args.mapYToRoomPoints,
      args.blankBackground,
      args.displayFlipY,
      args.backgroundFlipY,
      args.rhinoYUpToSvgYDown,
      { offset: args.rhinoYAffineOffset, scale: args.rhinoYAffineScale },
    );
    const parsedBatch = batchSchema.parse(assembled.batch);
    const files = [
      // Package layout: one batch entry point plus merged asset/behavior libraries.
      // Optional collider SVG sidecars, when referenced above, live beside these
      // JSON manifests but are copied by later packaging steps rather than written here.
      resolveOutputFile(args.out, "batch.json", assembled.batch),
      resolveOutputFile(args.out, "assets/objects.json", assembled.objectLibrary),
      resolveOutputFile(args.out, "assets/backgrounds.json", assembled.backgroundLibrary),
      resolveOutputFile(args.out, "behaviors/behaviors.json", assembled.behaviorLibrary),
    ];

    if (args.blankBackground) {
      files.push(resolveOutputFile(args.out, blankBackgroundSrc, blankBackgroundSvg));
    }

    for (const file of files) {
      await writeJsonFile(file);
    }

    console.log(`Assembled ${parsedBatch.trials.length} trial(s) to ${args.out}`);
    console.log("batch.json written");
    console.log("assets/objects.json written");
    console.log("assets/backgrounds.json written");
    console.log("behaviors/behaviors.json written");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  await main();
}
