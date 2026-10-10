import diff, { Diff } from "deep-diff";
import get from "lodash.get";
const { applyChange } = diff;

export function isSafeUpdate(update: Update<unknown>): boolean {
  const safeChange = (change: any): boolean => !!change &&
    ["N", "D", "E", "A"].includes(change.kind) &&
    (change.path === undefined || (Array.isArray(change.path) && change.path.every((part: unknown) =>
      (typeof part === "string" && !["__proto__", "constructor", "prototype"].includes(part)) ||
      (typeof part === "number" && Number.isSafeInteger(part) && part >= 0)))) &&
    (change.kind !== "A" || (Number.isSafeInteger(change.index) && change.index >= 0 && safeChange(change.item)));
  return !!update && Array.isArray(update.changes) && update.changes.every(safeChange);
}

export function applyChanges<LHS>(target: LHS, changes: Diff<LHS, any>[]) {
  for (const change of changes) {
    if (change.path && (change.kind === "E" || change.kind === "A")) {
      // If editing an object or array ensure that the value exists
      const valid = get(target, change.path) !== undefined;
      if (valid) {
        applyChange(target, true, change);
      }
    } else {
      applyChange(target, true, change);
    }
  }
}

export type Update<T> = {
  id: string;
  changes: Diff<T>[];
};
