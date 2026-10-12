import { itemOwners } from "./itemOwners";
import { Presence } from "../sceneRules";

const presence = (fields: Pick<Presence, "nickname" | "userId" | "role">): Presence =>
  ({ ...fields, sessionId: "", color: "blue", dice: { share: false, rolls: [] } });

test("owners include the GM, named connected players and disconnected current owners", () => {
  expect(itemOwners({
    gm: presence({ nickname: "Host", userId: "host-browser", role: "gm" }),
    first: presence({ nickname: "Robin", userId: "player-browser", role: "player" }),
    second: presence({ nickname: "Robin", userId: "player-browser", role: "trusted" }),
  }, ["gm", "absent-browser", "player-browser"])).toEqual([
    { id: "gm", name: "The GM" },
    { id: "player-browser", name: "Robin" },
    { id: "absent-browser", name: "absent-b" },
  ]);
});
