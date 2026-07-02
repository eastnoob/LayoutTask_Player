import { parseExperimentConfig } from "../schemas/experiment.schema";
import type { ExperimentConfig } from "../types/experiment";

export interface ExperimentLoaderOptions {
  baseUrl: string;
  configPath?: string;
  fetchImpl?: typeof fetch;
}

export class ExperimentLoader {
  private readonly baseUrl: string;
  private readonly configPath: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ExperimentLoaderOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.configPath = options.configPath ?? "experiment.json";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async load(): Promise<ExperimentConfig> {
    const response = await this.fetchImpl(new URL(this.configPath, this.baseUrl).toString());
    if (!response.ok) {
      throw new Error(`Failed to load ${this.configPath}: ${response.status} ${response.statusText}`);
    }
    return parseExperimentConfig(await response.json());
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl, "http://example.test/");
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}
