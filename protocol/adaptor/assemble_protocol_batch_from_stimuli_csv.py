"""
Assemble LayoutTask protocol output captured by StimuliGenerator.

Example:
    pixi run python scripts\\assemble_protocol_batch_from_stimuli_csv.py --csv C:\\runs\\data.csv --out C:\\runs\\layouttask-source --experiment-id parameter_model_5regions_v1 --title "Parameter Model 5 Regions"
"""

import argparse
import csv
import json
import re
from pathlib import Path


PLACEHOLDER_TASK_ID = "scene_from_runner"
LEGACY_DEFAULT_BEHAVIOR_TEMPLATE = "drag500_rotate45_limited"
DEFAULT_BEHAVIOR_TEMPLATE = "button500_rotate45_limited"
DEFAULT_COLLIDER_SUFFIX = "_COLLISION"
TASK_ID_SAFE = re.compile(r"[^A-Za-z0-9_-]+")


def parse_args(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--experiment-id", required=True)
    parser.add_argument("--title", default="")
    parser.add_argument(
        "--trust-svg-viewbox",
        action="store_true",
        help="Omit SVG object/background dimensions so the Player infers absolute size from SVG viewBox.",
    )
    parser.add_argument(
        "--attach-collider-svg",
        action="store_true",
        help="Attach same-name SVG collider sources to SVG objects that have no collision or legacy box collision.",
    )
    parser.add_argument(
        "--collider-suffix",
        default=DEFAULT_COLLIDER_SUFFIX,
        help="Suffix inserted before .svg for collider assets. Defaults to _COLLISION.",
    )
    return parser.parse_args(argv)


def load_rows(csv_path):
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def parse_json_cell(row, name, required=True):
    value = get_cell(row, name)
    if not value:
        if required:
            raise ValueError(f"Missing required column value: {name}")
        return None
    return json.loads(value)


def get_cell(row, name, default=""):
    for key in (name, "metric_" + name):
        value = (row.get(key) or "").strip()
        if value:
            return value
    return default


def safe_task_id(value, fallback):
    raw = str(value or "").strip() or fallback
    cleaned = TASK_ID_SAFE.sub("_", raw).strip("_")
    return cleaned or fallback


def row_task_id(row, row_index):
    for key in ("CombinationId", "combination_id", "RowIndex", "row_index"):
        value = (row.get(key) or "").strip()
        if value:
            return "scene_" + safe_task_id(value, f"{row_index:06d}")
    return f"scene_{row_index:06d}"


def replace_scene_placeholder(value, task_id):
    if isinstance(value, str):
        return value.replace(PLACEHOLDER_TASK_ID, task_id)
    if isinstance(value, list):
        return [replace_scene_placeholder(item, task_id) for item in value]
    if isinstance(value, dict):
        return {key: replace_scene_placeholder(item, task_id) for key, item in value.items()}
    return value


def with_default_world_units(world):
    if not isinstance(world, dict):
        return world
    result = dict(world)
    result.setdefault("unit", "mm")
    result.setdefault("coordinate_source", "rhino")
    result.setdefault("unit_scale", 1)
    return result


def extract_shared_world(trials):
    trials_with_world = [trial for trial in trials if isinstance(trial.get("world"), dict)]
    if not trials_with_world:
        return None

    normalized = [with_default_world_units(trial["world"]) for trial in trials_with_world]
    first = normalized[0]
    if all(world == first for world in normalized):
        for trial in trials:
            trial.pop("world", None)
        return first

    for trial, world in zip(trials_with_world, normalized):
        trial["world"] = world
    return None


def merge_dict(target, source, label):
    for key, value in source.items():
        if key in target:
            if target[key] != value:
                raise ValueError(f"Conflicting {label} asset definition for key: {key}")
            continue
        target[key] = value


def display_image_from_row(row):
    for key in ("stimulus_image_perspective", "display_image_src", "IMG"):
        value = get_cell(row, key)
        if value:
            return value.replace("\\", "/")
    return ""


def apply_display_image(trial, image_src):
    if not image_src:
        return

    existing = trial.get("display_image") if isinstance(trial.get("display_image"), dict) else {}
    trial["display_image"] = {
        "enabled": True,
        "src": image_src,
        "alt": existing.get("alt") or "Reference image",
    }
    if "record_metrics" in existing:
        trial["display_image"]["record_metrics"] = existing["record_metrics"]


def normalize_default_behavior_template(value):
    if isinstance(value, list):
        return [normalize_default_behavior_template(item) for item in value]
    if isinstance(value, dict):
        result = {key: normalize_default_behavior_template(item) for key, item in value.items()}
        if result.get("template") == LEGACY_DEFAULT_BEHAVIOR_TEMPLATE:
            result["template"] = DEFAULT_BEHAVIOR_TEMPLATE
        return result
    return value


def default_behavior_library():
    return {
        "schema": "layouttask.behaviors.v1",
        "behaviors": {
            DEFAULT_BEHAVIOR_TEMPLATE: {
                "movement": {
                    "mode": "button",
                    "step": 500,
                    "max_left": 2,
                    "max_right": 2,
                    "max_up": 2,
                    "max_down": 2,
                },
                "rotation": {
                    "step": 45,
                    "max_cw": 2,
                    "max_ccw": 2,
                },
                "free_drag": {
                    "enabled": False,
                    "snap": True,
                },
            }
        },
    }


def is_svg_asset(value):
    if not isinstance(value, dict):
        return False
    asset_type = str(value.get("type") or "").lower()
    src = str(value.get("src") or "").lower().split("?", 1)[0].split("#", 1)[0]
    return asset_type == "svg" or src.endswith(".svg")


def collider_source_from_object_asset(asset, collider_suffix):
    if not is_svg_asset(asset):
        return None

    src = str(asset.get("src") or "").replace("\\", "/").split("?", 1)[0].split("#", 1)[0]
    file_name = src.rsplit("/", 1)[-1]
    stem = re.sub(r"\.svg$", "", file_name, flags=re.IGNORECASE)
    if not stem:
        return None

    return f"assets/collision/objects/{stem}{collider_suffix}.svg"


def should_attach_collider(collision):
    if collision is None:
        return True

    if not isinstance(collision, dict):
        return False

    if collision.get("enabled") is False:
        return False

    return collision.get("shape") in (None, "box")


def with_collider_collision(collision, collider_src):
    existing = dict(collision) if isinstance(collision, dict) else {}
    existing.setdefault("enabled", True)
    existing["shape"] = "asset_outline"
    existing["source"] = {"type": "svg", "src": collider_src}
    return existing


def attach_object_collider_svgs(trial, object_assets, collider_suffix):
    for obj in trial.get("objects") or []:
        if not isinstance(obj, dict):
            continue
        if not should_attach_collider(obj.get("collision")):
            continue

        asset_key = str(obj.get("asset") or "")
        collider_src = collider_source_from_object_asset(object_assets.get(asset_key), collider_suffix)
        if not collider_src:
            continue

        obj["collision"] = with_collider_collision(obj.get("collision"), collider_src)


def strip_svg_asset_dimensions(assets):
    for asset in assets.values():
        if not is_svg_asset(asset):
            continue
        asset.pop("default_width", None)
        asset.pop("default_height", None)


def strip_trial_svg_dimensions(trial, object_assets, background_assets):
    for obj in trial.get("objects") or []:
        if not isinstance(obj, dict):
            continue
        if is_svg_asset(object_assets.get(str(obj.get("asset") or ""))):
            obj.pop("width", None)
            obj.pop("height", None)

    background = trial.get("background")
    if not isinstance(background, dict):
        return
    if not is_svg_asset(background_assets.get(str(background.get("asset") or ""))):
        return

    for key in ("x", "y", "width", "height"):
        background.pop(key, None)


def assemble(
    rows,
    experiment_id,
    title,
    trust_svg_viewbox=False,
    attach_collider_svg=False,
    collider_suffix=DEFAULT_COLLIDER_SUFFIX,
):
    trials = []
    object_assets = {}
    background_assets = {}

    for index, row in enumerate(rows, start=1):
        protocol_status = (get_cell(row, "protocol_status") or "ok").strip().lower()
        if protocol_status and protocol_status != "ok":
            raise ValueError(f"Row {index} has protocol_status={protocol_status!r}: {get_cell(row, 'protocol_notes')}")

        task_id = row_task_id(row, index)
        # Preserve target.relative from metric_trial_protocol_json as the canonical answer.
        # Do not synthesize target.absolute here; absolute pose is optional analysis data.
        trial = parse_json_cell(row, "trial_protocol_json")
        trial = replace_scene_placeholder(trial, task_id)
        if trial.get("task_id") in ("", PLACEHOLDER_TASK_ID, None):
            trial["task_id"] = task_id

        # qid 默认跟随 task_id，方便后续从数据行回查。
        if trial.get("qid") in ("", "Q_FROM_RUNNER", None):
            trial["qid"] = "Q_" + task_id
        apply_display_image(trial, display_image_from_row(row))
        trial = normalize_default_behavior_template(trial)

        object_library = parse_json_cell(row, "object_assets_json")
        background_library = parse_json_cell(row, "background_assets_json")
        if trust_svg_viewbox:
            strip_svg_asset_dimensions(object_library.get("objects", {}))
            strip_trial_svg_dimensions(
                trial,
                object_library.get("objects", {}),
                background_library.get("backgrounds", {}),
            )
        merge_dict(object_assets, object_library.get("objects", {}), "object")
        merge_dict(background_assets, background_library.get("backgrounds", {}), "background")
        if attach_collider_svg:
            attach_object_collider_svgs(trial, object_library.get("objects", {}), collider_suffix)
        trials.append(trial)

    shared_world = extract_shared_world(trials)
    shared = {
        "asset_library": "assets/objects.json",
        "background_library": "assets/backgrounds.json",
        "behavior_library": "behaviors/behaviors.json",
        "flow": {"mode": "direct_reconstruction"},
        "stage": {"fit": "contain", "max_height_ratio": 0.72, "padding": 16},
    }
    if shared_world is not None:
        shared["world"] = shared_world

    return {
        "schema": "layouttask.batch.v1",
        "experiment_id": experiment_id,
        "title": title,
        "shared": shared,
        "trials": trials,
    }, {
        "schema": "layouttask.assets.objects.v1",
        "objects": object_assets,
    }, {
        "schema": "layouttask.assets.backgrounds.v1",
        "backgrounds": background_assets,
    }, default_behavior_library()


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    args = parse_args()
    rows = load_rows(args.csv)
    if not rows:
        raise ValueError("CSV has no data rows.")

    batch, object_library, background_library, behavior_library = assemble(
        rows,
        args.experiment_id,
        args.title,
        args.trust_svg_viewbox,
        args.attach_collider_svg,
        args.collider_suffix,
    )
    out_dir = Path(args.out)
    write_json(out_dir / "batch.json", batch)
    write_json(out_dir / "assets" / "objects.json", object_library)
    write_json(out_dir / "assets" / "backgrounds.json", background_library)
    write_json(out_dir / "behaviors" / "behaviors.json", behavior_library)

    print("batch.json written")
    print("assets/objects.json written")
    print("assets/backgrounds.json written")
    print("behaviors/behaviors.json written")


if __name__ == "__main__":
    main()
