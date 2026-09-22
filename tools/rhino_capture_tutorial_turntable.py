import json
import math
import os
import traceback
import System

import Rhino

out_dir = os.environ.get(
    "LAYOUTTASK_CAPTURE_OUT",
    "D:/PROJECTS/RhinoGH/IsPictureEnough/stimuli/tutorial_reference_board/captures/one-by-one-review",
)
model_id = os.environ.get("LAYOUTTASK_CAPTURE_ID", "m02")
model_path = os.environ.get("LAYOUTTASK_CAPTURE_MODEL")
capture_mode = os.environ.get("LAYOUTTASK_CAPTURE_MODE", "all")
if not os.path.isdir(out_dir):
    os.makedirs(out_dir)

stage_path = os.path.join(out_dir, "{}_stage.log".format(model_id))


def stage(message):
    with open(stage_path, "a") as f:
        f.write(message + "\n")


stage("start")

try:
    from Rhino.Geometry import BoundingBox, Point3d
    from System.Drawing import Size

    if capture_mode not in {"all", "variable"}:
        raise Exception("Unsupported capture mode: {}".format(capture_mode))
    allowed_layers = {"GEOMETRY", "GROUP", "VARIABLE"} if capture_mode == "all" else {"GEOMETRY", "VARIABLE"}
    stage("imports_ready")
    if model_path:
        stage("before_open")
        Rhino.RhinoApp.RunScript('_-Open "{}" _Enter'.format(model_path.replace('"', '\\"')), False)
        stage("after_open")

    doc = Rhino.RhinoDoc.ActiveDoc
    stage("doc_ready")

    def layer_path(layer):
        return getattr(layer, "FullPath", None) or layer.Name

    def is_allowed(layer):
        path = layer_path(layer)
        return path in allowed_layers or path.split("::")[-1] in allowed_layers

    visible_ids = []
    selected_before = []
    layer_counts = {}
    object_type_counts = {}
    boxes = []
    view = doc.Views.ActiveView or doc.Views[0]
    viewport = view.ActiveViewport

    for obj in doc.Objects:
        if obj.IsSelected(False) > 0:
            selected_before.append(str(obj.Id))
        layer = doc.Layers[obj.Attributes.LayerIndex]
        path = layer_path(layer)
        layer_counts[path] = layer_counts.get(path, 0) + 1
        visible = is_allowed(layer)
        if obj.Attributes.Visible != visible:
            obj.Attributes.Visible = visible
            obj.CommitChanges()
        if not visible:
            continue
        type_name = str(obj.Geometry.ObjectType)
        object_type_counts[type_name] = object_type_counts.get(type_name, 0) + 1
        bbox = obj.Geometry.GetBoundingBox(True)
        if bbox.IsValid:
            boxes.append(bbox)
            visible_ids.append(str(obj.Id))

    if not boxes:
        raise Exception("No valid visible object bounding boxes for {}".format(model_id))

    doc.Objects.UnselectAll()

    stage("bbox_ready")
    bbox = BoundingBox.Union(boxes[0], boxes[0])
    for box in boxes[1:]:
        bbox = BoundingBox.Union(bbox, box)

    center = bbox.Center
    size = bbox.Max - bbox.Min
    span_xy = max(size.X, size.Y, 1.0)
    span_z = max(size.Z, 1.0)
    distance = max(span_xy * 2.4, span_z * 2.1, 6.0)
    height = max(span_z * 0.85, span_xy * 0.35, 2.5)
    target = Point3d(center.X, center.Y, center.Z + span_z * 0.12)

    mode = Rhino.Display.DisplayModeDescription.FindByName("Rendered")
    display_mode_before = viewport.DisplayMode.EnglishName
    if mode:
        viewport.DisplayMode = mode
    Rhino.RhinoApp.RunScript("_-SetDisplayMode _Mode=Rendered _Enter", False)
    try:
        viewport.ConstructionGridVisible = False
    except Exception:
        pass
    try:
        viewport.WorldAxesVisible = False
    except Exception:
        pass
    viewport.ChangeToPerspectiveProjection(True, 50.0)
    view.Redraw()
    display_mode_after = viewport.DisplayMode.EnglishName

    angles = [-90, -45, 0, 45, 90, 135, 180, 225]
    frames = []

    for i, degrees in enumerate(angles):
        stage("before_frame_{}".format(i))
        radians = math.radians(degrees)
        camera = Point3d(
            center.X + math.cos(radians) * distance,
            center.Y + math.sin(radians) * distance,
            center.Z + height,
        )
        direction = target - camera
        direction.Unitize()
        viewport.SetCameraLocation(camera, True)
        viewport.SetCameraDirection(direction, True)
        viewport.Camera35mmLensLength = 45.0
        view.Redraw()
        System.Threading.Thread.Sleep(1200)

        frame = os.path.join(out_dir, "{}_{:02d}.png".format(model_id, i))
        bitmap = view.CaptureToBitmap(Size(640, 480))
        bitmap.Save(frame)
        frames.append(frame)
        stage("after_frame_{}".format(i))

    metadata = {
        "model_id": model_id,
        "capture_mode": capture_mode,
        "doc_path": doc.Path,
        "allowed_layers": sorted(allowed_layers),
        "layer_counts": layer_counts,
        "object_type_counts": object_type_counts,
        "visible_object_count": len(visible_ids),
        "selected_before": selected_before,
        "display_mode_before": display_mode_before,
        "display_mode_after": display_mode_after,
        "bbox_min": [bbox.Min.X, bbox.Min.Y, bbox.Min.Z],
        "bbox_max": [bbox.Max.X, bbox.Max.Y, bbox.Max.Z],
        "angles": angles,
        "frames": frames,
    }
    with open(os.path.join(out_dir, "{}_metadata.json".format(model_id)), "w") as f:
        json.dump(metadata, f, indent=2)
except Exception:
    with open(os.path.join(out_dir, "{}_error.log".format(model_id)), "w") as f:
        f.write(traceback.format_exc())
    stage("error")

stage("before_exit")
Rhino.RhinoApp.RunScript("_-Exit _No", False)
