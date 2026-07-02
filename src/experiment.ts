import { ExperimentLoader } from "./core/experiment-loader";
import { createRunnableExperiment } from "./experiment-runner";
import "./styles/layout-task.css";

export async function createExperiment() {
  const loader = new ExperimentLoader({ baseUrl: "/experiment/" });
  return createRunnableExperiment(await loader.load());
}
