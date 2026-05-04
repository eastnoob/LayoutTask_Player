export interface LayoutTaskUrlParams {
  task?: string;
  q?: string;
  base?: string;
}

export function parseLayoutTaskUrlParams(input: string): LayoutTaskUrlParams {
  const search = input.startsWith("?") ? input : `?${input}`;
  const params = new URLSearchParams(search);

  return {
    task: params.get("task") ?? undefined,
    q: params.get("q") ?? undefined,
    base: params.get("base") ?? undefined,
  };
}
