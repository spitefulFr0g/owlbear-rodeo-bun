import { itemOwners } from "./itemOwners";

test("owners include the GM, named connected players and disconnected current owners", () => {
  expect(itemOwners({
    gm: { nickname: "Host", userId: "host-browser", role: "gm", dice: { share: false, rolls: [] } },
    first: { nickname: "Robin", userId: "player-browser", role: "player", dice: { share: false, rolls: [] } },
    second: { nickname: "Robin", userId: "player-browser", role: "trusted", dice: { share: false, rolls: [] } },
  }, ["gm", "absent-browser", "player-browser"])).toEqual([
    { id: "gm", name: "The GM" },
    { id: "player-browser", name: "Robin" },
    { id: "absent-browser", name: "absent-b" },
  ]);
});
