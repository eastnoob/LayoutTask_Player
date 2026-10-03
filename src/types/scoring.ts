/** Data-declared value equivalence used by scoring, independent of any asset name. */
export interface ScoringEquivalenceClasses {
  rotation_steps?: number[][];
}

export function matchesScoringValue(
  observed: number | undefined,
  target: number | undefined,
  equivalenceClasses?: number[][],
): boolean {
  if (observed === undefined || target === undefined) {
    return false;
  }
  if (observed === target) {
    return true;
  }
  return equivalenceClasses?.some((group) => group.includes(observed) && group.includes(target)) ?? false;
}
