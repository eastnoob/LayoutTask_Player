export type DesignRow = { combination_id: string } & Record<string, string>;
export type TaskMatch = { combination_id: string; task_id: string };

export function matchTasksToDesign(designRows: DesignRow[], taskIds: string[]): TaskMatch[] {
  const design = new Map(designRows.map((row) => [row.combination_id, row]));
  if (design.size !== designRows.length) throw new Error("duplicate combination_id");
  const matches = taskIds.map((task_id) => {
    const combination_id = task_id.replace(/^scene_/, "");
    if (!design.has(combination_id)) throw new Error(`missing design for ${task_id}`);
    return { combination_id, task_id };
  });
  if (new Set(matches.map((match) => match.combination_id)).size !== matches.length) {
    throw new Error("duplicate task combination");
  }
  return matches;
}
