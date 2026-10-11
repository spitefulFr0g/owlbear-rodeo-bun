import {
  awayFromOpenScene,
  ListedScene,
  mayBringPlayers,
  SceneList,
  sceneMarks,
  sortScenes,
} from "./sceneList";

const list: SceneList = {
  scenes: [
    { id: "road", name: "2 Road", viewOnly: false },
    { id: "keep", name: "10 Keep", viewOnly: false },
  ],
  openSceneId: "road",
  welcomeSceneId: null,
};

describe("awayFromOpenScene", () => {
  test("names both scenes while the GM views a scene that is not the open scene", () => {
    expect(awayFromOpenScene(list, "keep")).toEqual({
      viewedName: "10 Keep",
      openSceneId: "road",
      openName: "2 Road",
    });
  });

  test("is nothing while the GM views the open scene", () => {
    expect(awayFromOpenScene(list, "road")).toBeNull();
  });

  test("is nothing for anyone who was sent no scene list", () => {
    expect(awayFromOpenScene(null, "keep")).toBeNull();
  });

  test("is nothing before a scene has arrived", () => {
    expect(awayFromOpenScene(list, undefined)).toBeNull();
  });

  test("still says so when the list has not caught up with a scene just made", () => {
    expect(awayFromOpenScene(list, "new")).toEqual({
      viewedName: "",
      openSceneId: "road",
      openName: "2 Road",
    });
  });
});

describe("mayBringPlayers", () => {
  test("is offered to a GM viewing the open scene during a session", () => {
    expect(mayBringPlayers(list, "road", true)).toBe(true);
  });

  test("is not offered outside a session", () => {
    expect(mayBringPlayers(list, "road", false)).toBe(false);
    expect(mayBringPlayers(list, "road", undefined)).toBe(false);
  });

  test("is not offered while the GM views a scene that is not the open scene", () => {
    expect(mayBringPlayers(list, "keep", true)).toBe(false);
  });

  test("is not offered to anyone who was sent no scene list", () => {
    expect(mayBringPlayers(null, "road", true)).toBe(false);
  });

  test("is not offered before a scene has arrived", () => {
    expect(mayBringPlayers(list, undefined, true)).toBe(false);
  });
});

function named(...names: string[]): ListedScene[] {
  return names.map((name, index) => ({ id: `s${index}`, name, viewOnly: false }));
}

function names(scenes: ListedScene[]) {
  return scenes.map((scene) => scene.name);
}

describe("sortScenes", () => {
  test("reads numbers as numbers, so 2 comes before 10", () => {
    expect(names(sortScenes(named("10 Keep", "2 Road", "1 Gate")))).toEqual([
      "1 Gate",
      "2 Road",
      "10 Keep",
    ]);
  });

  test("reads a number inside a name as a number too", () => {
    expect(names(sortScenes(named("Level 12", "Level 3", "Level 1")))).toEqual([
      "Level 1",
      "Level 3",
      "Level 12",
    ]);
  });

  test("ignores capitals", () => {
    expect(names(sortScenes(named("cellar", "Barn", "attic", "Dock")))).toEqual([
      "attic",
      "Barn",
      "cellar",
      "Dock",
    ]);
  });

  test("keeps scenes that share a name in the same order however the server lists them", () => {
    const twins: ListedScene[] = [
      { id: "b", name: "Camp", viewOnly: false },
      { id: "a", name: "camp", viewOnly: false },
      { id: "c", name: "Camp", viewOnly: false },
    ];
    const sorted = sortScenes(twins).map((scene) => scene.id);
    expect(sorted).toEqual(["a", "b", "c"]);
    expect(sortScenes([...twins].reverse()).map((scene) => scene.id)).toEqual(sorted);
  });

  test("leaves the list it was given as it was", () => {
    const scenes = named("b", "a");
    sortScenes(scenes);
    expect(names(scenes)).toEqual(["b", "a"]);
  });
});

describe("sceneMarks", () => {
  test("marks the open scene and the scene being viewed apart", () => {
    expect(sceneMarks(list, "keep", "road")).toEqual(["open"]);
    expect(sceneMarks(list, "keep", "keep")).toEqual(["viewed"]);
  });

  test("gives both marks to the open scene while the GM views it", () => {
    expect(sceneMarks(list, "road", "road")).toEqual(["open", "viewed"]);
  });

  test("marks a view-only scene, after the open and viewed marks", () => {
    const handout: SceneList = {
      ...list,
      scenes: [list.scenes[0], { ...list.scenes[1], viewOnly: true }],
      openSceneId: "keep",
    };
    expect(sceneMarks(handout, "road", "road")).toEqual(["viewed"]);
    expect(sceneMarks(handout, "keep", "keep")).toEqual(["open", "viewed", "viewOnly"]);
    expect(sceneMarks(handout, undefined, "keep")).toEqual(["open", "viewOnly"]);
  });

  test("marks nothing as viewed before a scene has arrived", () => {
    expect(sceneMarks(list, undefined, "keep")).toEqual([]);
  });
});

 test("marks the welcome screen even when it is also open and viewed", () => {
  const welcome = { ...list, welcomeSceneId: "road" };
  expect(sceneMarks(welcome, "road", "road")).toEqual(["open", "viewed", "welcome"]);
  expect(sceneMarks(welcome, "road", "keep")).toEqual([]);
  expect(sceneMarks({ ...welcome, welcomeSceneId: null }, "road", "road")).toEqual(["open", "viewed"]);
});
