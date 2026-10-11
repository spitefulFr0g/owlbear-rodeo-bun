import { applyChange, Change, invertChange, Scene } from "../sceneRules";

export type HistoryStep = { id: string; undo: Change[]; redo: Change[] };
export type History = { undo: HistoryStep[]; redo: HistoryStep[] };
export const emptyHistory: History = { undo: [], redo: [] };

/** One action is one step; inverses run in reverse order against each change's prior scene. */
export function remember(history: History, scene: Scene, changes: Change[], id: string): History {
  const undo: Change[] = [];
  const redo: Change[] = [];
  for (const change of changes) {
    const inverse = invertChange(scene, change);
    if (!inverse) continue;
    undo.unshift(inverse);
    redo.push(change);
    scene = applyChange(scene, change).scene;
  }
  if (!undo.length) return history;
  return { undo: [...history.undo, { id, undo, redo }].slice(-50), redo: [] };
}

/** Skip a step if an item is gone (or an add would occupy an existing id). */
export function historyChanges(scene: Scene, changes: Change[]): Change[] {
  const result: Change[] = [];
  for (const change of changes) {
    const applied = applyChange(scene, change);
    if (!applied.applied) return [];
    result.push(change);
    scene = applied.scene;
  }
  return result;
}

export function dropStep(history: History, id: string): History {
  return { undo: history.undo.filter(step => step.id !== id), redo: history.redo.filter(step => step.id !== id) };
}
