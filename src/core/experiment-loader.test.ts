import { describe, expect, it, vi } from "vitest";
import { ExperimentLoader } from "./experiment-loader";

describe("ExperimentLoader", () => {
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
