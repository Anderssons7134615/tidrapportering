// Assignment names are snapshots, not delimited day text. Preserve them literally.
export function validPlanningAssignments(value: unknown): value is string[][] {
  return Array.isArray(value) && value.length === 5 && value.every(names =>
    Array.isArray(names) && names.length <= 200 && new Set(names).size === names.length
    && names.every(name => typeof name === 'string' && name.length <= 200 && Boolean(name.trim())));
}
