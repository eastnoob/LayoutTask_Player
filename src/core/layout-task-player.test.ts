import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayoutTaskPlayer } from "./layout-task-player";
import { FlowController } from "./flow-controller";
import { Recorder } from "./recorder";
import { LayoutTaskRenderer } from "./renderer";
import { InteractionController } from "./interaction-controller";
import { createRuntimeConfig } from "../test-support/runtime-config";
import { ConfidenceController } from "./confidence-controller";
import * as board from "./tutorial-reference-board";
import { ExperimentPauseController } from "./experiment-pause";

describe("createLayoutTaskPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts the board after direction acknowledgement and enforces practices through real player callbacks", async () => {
    const base = createRuntimeConfig();
    const config = { ...base, referenceMode: "persistent" as const,
      objects: ["chair", "table", "sofa"].map((id) => ({ ...base.objects[0], id, group_id: id, role: "variable" as const })) };
    let rendererOptions!: ConstructorParameters<typeof LayoutTaskRenderer>[0];
    const mount = vi.spyOn(LayoutTaskRenderer.prototype, "mount").mockImplementation(function (this: LayoutTaskRenderer) {
      rendererOptions = (this as unknown as { options: typeof rendererOptions }).options;
      return this.refs;
    });
    for (const method of ["showTutorialStep", "enterReconstructionFlow", "activateObject", "updateControlsDisabled",
      "showConfidenceForActiveGroup", "setStatus", "focusConfidence", "clearActiveObject", "hideConfidence", "destroy"] as const) {
      vi.spyOn(LayoutTaskRenderer.prototype, method).mockImplementation(() => undefined);
    }
    vi.spyOn(Recorder.prototype, "start").mockImplementation(() => undefined);
    const finish = vi.spyOn(Recorder.prototype, "finish");
    const choose = vi.spyOn(ConfidenceController.prototype, "choose");
    const save = vi.spyOn(ConfidenceController.prototype, "saveActiveGroup");
    const boardDestroy = vi.fn();
    const boardMount = vi.spyOn(board, "mountTutorialReferenceBoard").mockReturnValue({ destroy: boardDestroy });
    const player = createLayoutTaskPlayer({ root: {} as HTMLElement, config, tutorialMode: true, developerMode: true,
      confidence: { required: true, scale: [1, 2, 3, 4, 5], labels: {} },
      tutorialReferenceBoard: { pages: ["1", "2", "3", "4"], continueLabel: "Continue" } });
    player.start();
    expect(rendererOptions.isObjectFirstSaveComplete?.("chair")).toBe(false);
    expect(rendererOptions.isObjectFirstSaveComplete?.("table")).toBe(false);
    expect(rendererOptions.isObjectFirstSaveComplete?.("missing")).toBe(true);
    expect(boardMount).not.toHaveBeenCalled();
    rendererOptions.onObjectSelect?.("chair");
    rendererOptions.confidence?.onChoose("position", 3);
    rendererOptions.onDeveloperShortcut?.();
    expect(choose).not.toHaveBeenCalled();
    rendererOptions.onTutorialAcknowledge?.();
    expect(boardMount).toHaveBeenCalledOnce();
    expect(player.getTutorialStep()?.id).toBe("reference_board");
    rendererOptions.onConfirm?.(); await Promise.resolve();
    expect(finish).not.toHaveBeenCalled();
    boardMount.mock.calls[0][0].onComplete();
    expect(player.getTutorialStep()?.id).toBe("magnifier_practice");
    rendererOptions.onObjectSelect?.("table"); rendererOptions.confidence?.onSave();
    expect(save).not.toHaveBeenCalled();
    expect(player.handleTutorialPractice("pause_requested")).toBe(false);
    player.handleTutorialPractice("magnifier_entered");
    player.handleTutorialPractice("magnifier_zoom_changed", { zoomBefore: 2, zoomAfter: 2.25 });
    player.handleTutorialPractice("magnifier_exited", { exitReason: "escape" });
    rendererOptions.onObjectSelect?.("chair");
    rendererOptions.confidence?.onChoose("position", 3); rendererOptions.confidence?.onSave();
    expect(player.getTutorialStep()?.id).toBe("confidence_first");
    const editState = player.getState();
    const choicesBeforeRepeatedUse = choose.mock.calls.length;
    for (let use = 0; use < 2; use += 1) {
      expect(player.canStartMagnifier()).toBe(true);
      expect(rendererOptions.magnifier!.onEnter({ clientX: 10, clientY: 20 })).toBe(true);
      expect(rendererOptions.magnifier!.controller.isActive()).toBe(true);
      rendererOptions.confidence?.onChoose("rotation", 1);
      expect(choose).toHaveBeenCalledTimes(choicesBeforeRepeatedUse);
      expect(rendererOptions.magnifier!.onWheel(1)).toBeDefined();
      expect(rendererOptions.magnifier!.onExit("escape")).toBe(true);
      expect(player.getTutorialStep()?.id).toBe("confidence_first");
      expect(player.getState()).toEqual(editState);
    }
    expect(player.getMagnifierSnapshot().use_count).toBe(2);
    rendererOptions.confidence?.onChoose("rotation", 4); rendererOptions.confidence?.onSave();
    expect(rendererOptions.isObjectFirstSaveComplete?.("chair")).toBe(true);
    expect(rendererOptions.isObjectFirstSaveComplete?.("table")).toBe(false);
    expect(player.getTutorialStep()?.id).toBe("pause_practice");
    const savesAtPractice = save.mock.calls.length;
    rendererOptions.onDeveloperShortcut?.(); rendererOptions.onObjectSelect?.("table"); rendererOptions.confidence?.onSave();
    expect(save).toHaveBeenCalledTimes(savesAtPractice);
    player.handleTutorialPractice("pause_requested"); player.handleTutorialPractice("pause_cancelled");
    expect(player.getTutorialStep()?.id).toBe("pause_practice");
    player.handleTutorialPractice("pause_requested"); player.handleTutorialPractice("pause_confirmed");
    player.handleTutorialPractice("pause_resumed", { resumeReason: "auto_resume_10s" });
    rendererOptions.onDeveloperShortcut?.();
    expect(save).toHaveBeenCalledTimes(savesAtPractice);
    for (const id of ["table", "sofa"]) {
      rendererOptions.onObjectSelect?.(id);
      rendererOptions.confidence?.onChoose("position", 3); rendererOptions.confidence?.onChoose("rotation", 3);
      rendererOptions.confidence?.onSave();
    }
    expect(player.getTutorialStep()?.id).toBe("submit");
    expect(mount).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("mounts, starts recording, binds interaction, and destroys cleanly", () => {
    const mountSpy = vi.spyOn(LayoutTaskRenderer.prototype, "mount").mockReturnValue({
      root: {} as HTMLElement,
      objectElements: new Map(),
      objectVisualElements: new Map(),
      controlElements: new Map(),
      controlButtons: new Map(),
      displayImageFrameElement: undefined,
      displayImageElement: undefined,
    });
    const destroySpy = vi.spyOn(LayoutTaskRenderer.prototype, "destroy").mockImplementation(() => undefined);
    const startSpy = vi.spyOn(Recorder.prototype, "start").mockImplementation(() => undefined);
    const bindSpy = vi.spyOn(InteractionController.prototype, "bind").mockImplementation(() => undefined);
    const unbindSpy = vi.spyOn(InteractionController.prototype, "unbind").mockImplementation(() => undefined);

    const player = createLayoutTaskPlayer({
      root: {} as HTMLElement,
      config: createRuntimeConfig(),
    });

    player.start();
    expect(mountSpy).toHaveBeenCalledOnce();
    expect(startSpy).toHaveBeenCalledOnce();
    expect(bindSpy).toHaveBeenCalledOnce();
    expect(player.isLocked()).toBe(false);

    player.destroy();
    expect(unbindSpy).toHaveBeenCalledOnce();
    expect(destroySpy).toHaveBeenCalledOnce();
  });

  it("starts direct reconstruction flow immediately", () => {
    const flowStartSpy = vi.spyOn(FlowController.prototype, "start").mockImplementation(() => undefined);
    const bindSpy = vi.spyOn(InteractionController.prototype, "bind").mockImplementation(() => undefined);
    vi.spyOn(LayoutTaskRenderer.prototype, "mount").mockReturnValue({
      root: {} as HTMLElement,
      objectElements: new Map(),
      objectVisualElements: new Map(),
      controlElements: new Map(),
      controlButtons: new Map(),
      displayImageFrameElement: undefined,
      displayImageElement: undefined,
    });

    const player = createLayoutTaskPlayer({
      root: {} as HTMLElement,
      config: createRuntimeConfig(),
    });

    player.start();

    expect(flowStartSpy).toHaveBeenCalledOnce();
    expect(bindSpy).not.toHaveBeenCalled();
  });

  it("wires real magnifier practice producers and keeps Pause unavailable while active", () => {
    const base = createRuntimeConfig();
    const config = { ...base, referenceMode: "persistent" as const };
    let rendererOptions!: ConstructorParameters<typeof LayoutTaskRenderer>[0];
    vi.spyOn(LayoutTaskRenderer.prototype, "mount").mockImplementation(function (this: LayoutTaskRenderer) {
      rendererOptions = (this as unknown as { options: typeof rendererOptions }).options;
      return this.refs;
    });
    for (const method of ["showTutorialStep", "enterReconstructionFlow", "destroy"] as const) {
      vi.spyOn(LayoutTaskRenderer.prototype, method).mockImplementation(() => undefined);
    }
    vi.spyOn(Recorder.prototype, "start").mockImplementation(() => undefined);

    const player = createLayoutTaskPlayer({ root: {} as HTMLElement, config, tutorialMode: true });
    player.start();
    rendererOptions.onTutorialAcknowledge?.();

    expect(player.getTutorialStep()?.id).toBe("magnifier_practice");
    expect(rendererOptions.magnifier).toBeDefined();
    expect(player.canStartPause()).toBe(false);
    expect(rendererOptions.magnifier?.onEnter({ clientX: 10, clientY: 20 })).toBe(true);
    expect(player.canStartMagnifier()).toBe(false);
    expect(player.canStartPause()).toBe(false);
    expect(rendererOptions.magnifier?.onWheel(1)).toEqual({ zoomBefore: 2, zoomAfter: 2.25 });
    expect(rendererOptions.magnifier?.onExit("escape")).toBe(true);
    expect(player.getTutorialStep()?.id).toBe("select_first");
    player.destroy();
  });

  it("preserves formal edit context and blocks direct callbacks and shared Pause requests", async () => {
    let rendererOptions!: ConstructorParameters<typeof LayoutTaskRenderer>[0];
    vi.spyOn(LayoutTaskRenderer.prototype, "mount").mockImplementation(function (this: LayoutTaskRenderer) {
      rendererOptions = (this as unknown as { options: typeof rendererOptions }).options;
      return this.refs;
    });
    for (const method of ["enterReconstructionFlow", "activateObject", "updateControlsDisabled", "showConfidenceForActiveGroup",
      "setStatus", "focusConfidence", "clearActiveObject", "hideConfidence", "destroy"] as const) {
      vi.spyOn(LayoutTaskRenderer.prototype, method).mockImplementation(() => undefined);
    }
    vi.spyOn(Recorder.prototype, "start").mockImplementation(() => undefined);
    const record = vi.spyOn(Recorder.prototype, "recordEvent");
    const finish = vi.spyOn(Recorder.prototype, "finish");
    const choose = vi.spyOn(ConfidenceController.prototype, "choose");
    const save = vi.spyOn(ConfidenceController.prototype, "saveActiveGroup");
    const pause = new ExperimentPauseController({ mode: "formal" });
    const base = createRuntimeConfig();
    const config = { ...base, objects: [{ ...base.objects[0], role: "variable" as const }] };
    const player = createLayoutTaskPlayer({ root: {} as HTMLElement, config, pause, developerMode: true,
      confidence: { required: true, scale: [1, 2, 3, 4, 5], labels: {} } });
    player.start();
    rendererOptions.onObjectSelect?.("chair_01");
    rendererOptions.confidence?.onChoose("position", 4);
    const pose = player.getState();
    const eventCount = record.mock.calls.length;
    const choicesBeforeMagnifier = choose.mock.calls.length;
    expect(rendererOptions.magnifier!.onEnter({ clientX: 10, clientY: 20 })).toBe(true);
    rendererOptions.onAction?.("chair_01", "rotate_cw", {} as MouseEvent);
    rendererOptions.onObjectSelect?.("chair_01");
    rendererOptions.onStageBackgroundClick?.();
    rendererOptions.confidence?.onChoose("position", 1);
    rendererOptions.confidence?.onSave();
    rendererOptions.onDeveloperShortcut?.();
    rendererOptions.onConfirm?.();
    pause.requestPause();
    await Promise.resolve();
    expect(pause.snapshot().status).toBe("available");
    expect(player.getState()).toEqual(pose);
    expect(player.isLocked()).toBe(false);
    expect(finish).not.toHaveBeenCalled();
    expect(choose).toHaveBeenCalledTimes(choicesBeforeMagnifier);
    expect(save).not.toHaveBeenCalled();
    rendererOptions.magnifier!.onWheel(1);
    rendererOptions.magnifier!.onExit("escape");
    expect(record).toHaveBeenCalledTimes(eventCount);
    rendererOptions.confidence?.onChoose("rotation", 3);
    rendererOptions.confidence?.onSave();
    expect(save).toHaveLastReturnedWith({ ok: true });
    pause.requestPause();
    expect(player.canStartMagnifier()).toBe(false);
    pause.cancelConfirmation();
    expect(rendererOptions.magnifier!.onEnter({ clientX: 0, clientY: 0 })).toBe(true);
    player.destroy();
    expect(rendererOptions.magnifier!.controller.isActive()).toBe(false);
    expect(player.getMagnifierSnapshot().use_count).toBe(2);
    pause.requestPause();
    expect(pause.snapshot().status).toBe("confirming");
  });
});
