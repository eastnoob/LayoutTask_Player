export interface LayoutTaskUrlParams {
  task?: string;
  q?: string;
  base?: string;
  config?: string;
  requestedSequenceId?: string;
}

export function getDefaultExperimentConfigPath(configPath: string | undefined, isDev: boolean): string {
  return configPath ?? (isDev ? "experiment-debug.json" : "experiment.json");
}

export function isDeveloperDebugExperiment(configPath: string, debugParam: string | null): boolean {
  return debugParam === "1" || /^experiment-debug(?:-[^.]+)?\.json$/.test(configPath);
}

export function parseLayoutTaskUrlParams(input: string): LayoutTaskUrlParams {
  const search = input.startsWith("?") ? input : `?${input}`;
  const params = new URLSearchParams(search);

  const sequence = params.get("sequence");
  if (sequence !== null && !/^[1-9]\d*$/.test(sequence)) {
    throw new Error("Invalid sequence parameter");
  }

  return {
    task: params.get("task") ?? undefined,
    q: params.get("q") ?? undefined,
    base: params.get("base") ?? undefined,
    config: params.get("config") ?? undefined,
    requestedSequenceId: sequence ?? undefined,
  };
}

export function isTutorialBaseUrl(baseUrl: string, origin = 'http://localhost/'): boolean {
  return new URL(baseUrl, origin).pathname.replace(/\/+$/, '').endsWith('/layout-task-tutorial');
}
