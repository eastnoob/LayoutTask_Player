// Stable protocol vocabulary shared by types, schemas, and tooling; not UI/presentation enums.
export const OBJECT_ROLES = ["fixed", "variable"] as const;
export const ANCHORS = ["center", "top_left"] as const;
export const MOVEMENT_MODES = ["none", "button", "drag"] as const;
export const FLOW_MODES = ["direct_reconstruction", "preview_then_reconstruct"] as const;
export const PREVIEW_STAGE_MODES = ["hidden", "locked"] as const;
export const STAGE_FITS = ["contain"] as const;

export type ObjectRole = (typeof OBJECT_ROLES)[number];
