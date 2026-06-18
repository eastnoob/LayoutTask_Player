import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { batchSchema } from "../../src/schemas/batch.schema";

const placeholderTaskId = "scene_from_runner";
const legacyDefaultBehaviorTemplate = "drag500_rotate45_limited";
const defaultBehaviorTemplate = "button500_rotate45_limited";
const taskIdSafePattern = /[^A-Za-z0-9_-]+/g;

const usage = `Usage: tsx protocol/adaptor/assemble-stimuli-csv.ts --csv <file> --out <dir> --experiment-id <id> [--title <title>] [--trust-svg-viewbox] [--svg-viewbox-scale <number>]`;

interface CliArgs {
  csv?: string;
  out?: string;
  experimentId?: string;
  title: string;
  trustSvgViewBox: boolean;
  svgViewBoxScale: number;
}

type CsvRow = Record<string, string | undefined>;
type JsonObject = Record<string, unknown>;

interface OutputFile {
  target: string;
  value: unknown;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function parseArgs(args: string[]): CliArgs {
  const parsed: CliArgs = { title: "", trustSvgViewBox: false, svgViewBoxScale: 1 };

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

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isFinite(parsed.svgViewBoxScale) || parsed.svgViewBoxScale <= 0) {
    throw new Error("--svg-viewbox-scale must be a positive number");
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
  const firstJson = JSON.stringify(first);
  const allEqual = normalized.every((world) => JSON.stringify(world) === firstJson);

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
      if (JSON.stringify(target[key]) !== JSON.stringify(value)) {
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

function assemble(rows: CsvRow[], experimentId: string, title: string, trustSvgViewBox: boolean, svgViewBoxScale: number): {
  batch: JsonObject;
  objectLibrary: JsonObject;
  backgroundLibrary: JsonObject;
  behaviorLibrary: JsonObject;
} {
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
    // The adaptor treats metric_trial_protocol_json as the source of truth.
    // Preserve target.relative as authored and do not synthesize target.absolute.
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
    trials.push(trial);
  });

  const shared: JsonObject = {
    asset_library: "assets/objects.json",
    background_library: "assets/backgrounds.json",
    behavior_library: "behaviors/behaviors.json",
    flow: { mode: "direct_reconstruction" },
    stage: { fit: "contain", max_height_ratio: 0.72, padding: 16 },
  };
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
      backgrounds: backgroundAssets,
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

    const assembled = assemble(rows, args.experimentId, args.title, args.trustSvgViewBox, args.svgViewBoxScale);
    const parsedBatch = batchSchema.parse(assembled.batch);
    const files = [
      resolveOutputFile(args.out, "batch.json", assembled.batch),
      resolveOutputFile(args.out, "assets/objects.json", assembled.objectLibrary),
      resolveOutputFile(args.out, "assets/backgrounds.json", assembled.backgroundLibrary),
      resolveOutputFile(args.out, "behaviors/behaviors.json", assembled.behaviorLibrary),
    ];

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

await main();
