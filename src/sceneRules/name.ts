import { maxSceneNameLength } from "./caps";

export function checkSceneName(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const name = value.trim();
  if (name.length < 1 || name.length > maxSceneNameLength) return;
  return name;
}
