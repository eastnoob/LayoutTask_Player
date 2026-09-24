import { describe, expect, it, vi } from "vitest";
import { ExperimentLoader } from "./experiment-loader";

describe("ExperimentLoader", () => {
  it("exposes the selected reference mode to the experiment runner", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        schema: "layouttask.experiment.v1",
        experiment_id: "layout_task_v1",
        baseUrl: "./layout-task-formal/",
        reference_mode: "persistent",
        order: "fixed",
        trials: [{ taskId: "scene_001" }],
      }),
    })) as unknown as typeof fetch;

    const config = await new ExperimentLoader({ baseUrl: "/experiment/", fetchImpl }).load();

    expect(config.referenceMode).toBe("persistent");
  });

  it("resolves a separate tutorial package base URL", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        schema: "layouttask.experiment.v1",
        experiment_id: "layout_task_v1",
        baseUrl: "./layout-task-formal/",
        order: "fixed",
        tutorial: {
          enabled: true,
          baseUrl: "../layout-task-tutorial/",
          taskId: "tutorial_scene",
        },
        trials: [{ taskId: "scene_001", qid: "Q001" }],
      }),
    })) as unknown as typeof fetch;

    const loader = new ExperimentLoader({ baseUrl: "/experiment/", fetchImpl });
    const config = await loader.load();

    expect(config.tutorial.baseUrl).toBe("http://example.test/layout-task-tutorial/");
  });

  it("loads and parses experiment.json from a static base URL", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        schema: "layouttask.experiment.v1",
        experiment_id: "layout_task_v1",
        baseUrl: "./layout-task/",
        order: "fixed",
        trials: [{ taskId: "scene_001", qid: "Q001" }],
      }),
    })) as unknown as typeof fetch;

    const loader = new ExperimentLoader({ baseUrl: "/experiment/", fetchImpl });
    const config = await loader.load();

    expect(fetchImpl).toHaveBeenCalledWith("http://example.test/experiment/experiment.json");
    expect(config.experimentId).toBe("layout_task_v1");
    expect(config.baseUrl).toBe("http://example.test/experiment/layout-task/");
    expect(config.trials).toEqual([{ taskId: "scene_001", qid: "Q001" }]);
  });

  it("throws a clear load error", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    })) as unknown as typeof fetch;

    const loader = new ExperimentLoader({ baseUrl: "http://example.test/experiment/", fetchImpl });

    await expect(loader.load()).rejects.toThrow("Failed to load experiment.json: 404 Not Found");
  });
});
