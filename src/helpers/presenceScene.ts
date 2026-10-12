import { Presence } from "../sceneRules";
import { Role } from "../types/Room";
import { SceneList } from "./sceneList";

/** A GM's scene mark, using only the scene information this receiver may see. */
export function presenceSceneMark(
  presence: Presence,
  role: Role,
  session: boolean | undefined,
  viewedSceneId: string | undefined,
  list: SceneList | null
): string | undefined {
  if (presence.role !== "gm") return;
  if (role !== "gm") {
    return session && presence.elsewhere ? "Viewing another scene" : undefined;
  }
  if (!presence.sceneId || !viewedSceneId || presence.sceneId === viewedSceneId) return;
  const name = list?.scenes.find((scene) => scene.id === presence.sceneId)?.name;
  return name ? `Viewing: ${name}` : "Viewing another scene";
}
