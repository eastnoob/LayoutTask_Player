import { parseExperimentConfig } from "../schemas/experiment.schema";
import type { ExperimentConfig } from "../types/experiment";
import type { ReferenceMode } from "../types/config";
import { parseExperimentSchedule } from "../schemas/schedule.schema";

export interface ExperimentLoaderOptions {
  baseUrl: string;
  configPath?: string;
  fetchImpl?: typeof fetch;
  referenceMode?: ReferenceMode;
}

export class ExperimentLoader {
  private readonly baseUrl: string;
  private readonly configPath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly referenceMode?: ReferenceMode;

  constructor(options: ExperimentLoaderOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.configPath = options.configPath ?? "experiment.json";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.referenceMode = options.referenceMode;
  }

  async load(): Promise<ExperimentConfig> {
    const response = await this.fetchImpl(new URL(this.configPath, this.baseUrl).toString());
    if (!response.ok) {
      throw new Error(`Failed to load ${this.configPath}: ${response.status} ${response.statusText}`);
    }
    const config = parseExperimentConfig(await response.json());
    const schedule = config.schedulePath
      ? await this.loadSchedule(config.schedulePath)
      : config.schedule;
    return {
      ...config,
      referenceMode: this.referenceMode ?? config.referenceMode,
      baseUrl: new URL(config.baseUrl, this.baseUrl).toString(),
      tutorial: {
        ...config.tutorial,
        baseUrl: config.tutorial.baseUrl
          ? new URL(config.tutorial.baseUrl, this.baseUrl).toString()
          : undefined,
      },
      schedule,
    };
  }

  private async loadSchedule(schedulePath: string) {
    const response = await this.fetchImpl(new URL(schedulePath, this.baseUrl).toString());
    if (!response.ok) {
      throw new Error(`Failed to load ${schedulePath}: ${response.status} ${response.statusText}`);
    }
    return parseExperimentSchedule(await response.json());
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl, "http://example.test/");
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}
