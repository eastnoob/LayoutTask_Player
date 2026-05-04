import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayoutTaskPlayer } from "./layout-task-player";
import { Recorder } from "./recorder";
import { LayoutTaskRenderer } from "./renderer";
import { InteractionController } from "./interaction-controller";
import { createRuntimeConfig } from "../test-support/runtime-config";

describe("createLayoutTaskPlayer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts, starts recording, binds interaction, and destroys cleanly", () => {
    const mountSpy = vi.spyOn(LayoutTaskRenderer.prototype, "mount").mockReturnValue({
      root: {} as HTMLElement,
      objectElements: new Map(),
      controlElements: new Map(),
      controlButtons: new Map(),
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
});
