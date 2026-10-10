import { getRoleControls } from "./roomControls";

describe("getRoleControls", () => {
  test("gives the GM the map, what is hidden and the room", () => {
    expect(getRoleControls("gm")).toEqual({
      map: true,
      hidden: true,
      room: true,
    });
  });

  test("gives a player none of them", () => {
    expect(getRoleControls("player")).toEqual({
      map: false,
      hidden: false,
      room: false,
    });
  });

  test("gives a trusted player none of them either", () => {
    expect(getRoleControls("trusted")).toEqual({
      map: false,
      hidden: false,
      room: false,
    });
  });
});
