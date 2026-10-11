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

/**
 * Whether Bring players here is offered: to a GM, who alone has a scene list,
 * viewing the open scene during a session.
 */
export function mayBringPlayers(
  list: SceneList | null,
  viewedSceneId: string | undefined,
  session: boolean | undefined
): boolean {
  return !!list && !!session && viewedSceneId === list.openSceneId;
}

/**
 * The scenes in the order the list shows them: by name, ignoring capitals and
 * comparing numbers as numbers. Scenes sharing a name keep one order between
 * lists, by id.
 */
export function sortScenes(scenes: ListedScene[]): ListedScene[] {
  return [...scenes].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
        numeric: true,
      }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** What the list says a scene is, beside its name */
export type SceneMark = "open" | "viewed" | "viewOnly" | "welcome";

/** The marks of one scene of the list, in the order shown */
export function sceneMarks(
  list: SceneList,
  viewedSceneId: string | undefined,
  sceneId: string
): SceneMark[] {
  const marks: SceneMark[] = [];
  if (sceneId === list.openSceneId) marks.push("open");
  if (sceneId === viewedSceneId) marks.push("viewed");
  if (list.scenes.some((scene) => scene.id === sceneId && scene.viewOnly)) {
    marks.push("viewOnly");
  }
  if (sceneId === list.welcomeSceneId) marks.push("welcome");
  return marks;
}
