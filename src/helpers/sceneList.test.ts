import { awayFromOpenScene, SceneList } from "./sceneList";

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
