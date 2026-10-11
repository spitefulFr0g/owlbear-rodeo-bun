/** A scene as the scene list names it */
export type ListedScene = { id: string; name: string; viewOnly: boolean };

/** The room's scenes as the server sends them to a GM, in no promised order */
export type SceneList = {
  scenes: ListedScene[];
  openSceneId: string;
  welcomeSceneId: string | null;
};

/** What the notice says while a GM views a scene that is not the open scene */
export type AwayFromOpenScene = {
  viewedName: string;
  openSceneId: string;
  openName: string;
};

/**
 * Null while the scene viewed is the open scene, and for anyone with no scene
 * list. A name is empty while the list has yet to name that scene.
 */
export function awayFromOpenScene(
  list: SceneList | null,
  viewedSceneId: string | undefined
): AwayFromOpenScene | null {
  if (!list || !viewedSceneId || viewedSceneId === list.openSceneId) {
    return null;
  }
  function name(id: string) {
    return list?.scenes.find((scene) => scene.id === id)?.name || "";
  }
  return {
    viewedName: name(viewedSceneId),
    openSceneId: list.openSceneId,
    openName: name(list.openSceneId),
  };
}
