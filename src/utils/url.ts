export interface LayoutTaskUrlParams {
  task?: string;
  q?: string;
  base?: string;
  config?: string;
}

export function getDefaultExperimentConfigPath(configPath: string | undefined, isDev: boolean): string {
  return configPath ?? (isDev ? "experiment-debug.json" : "experiment.json");
}

export function isDeveloperDebugExperiment(configPath: string, debugParam: string | null): boolean {
  return debugParam === "1" || configPath === "experiment-debug.json";
}

export function parseLayoutTaskUrlParams(input: string): LayoutTaskUrlParams {
  const search = input.startsWith("?") ? input : `?${input}`;
  const params = new URLSearchParams(search);

  return {
    task: params.get("task") ?? undefined,
    q: params.get("q") ?? undefined,
    base: params.get("base") ?? undefined,
    config: params.get("config") ?? undefined,
  };
}

export function isTutorialBaseUrl(baseUrl: string, origin = 'http://localhost/'): boolean {
  return new URL(baseUrl, origin).pathname.replace(/\/+$/, '').endsWith('/layout-task-tutorial');
}
