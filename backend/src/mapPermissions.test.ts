import { ImageItem, Change } from "../../src/sceneRules";
import { expect, test } from "bun:test";
import { createRoom, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";
const map: ImageItem = { id: "map", kind: "image", layer: "map", position: { x: 0, y: 0 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 999, owner: "forged", locked: true, hidden: false, metadata: {},
  image: { type: "default", key: "map" }, width: 150, height: 150, label: "Map",
  outline: { type: "rect", x: 0, y: 0, width: 150, height: 150 } };
test("the server refuses player and trusted player Map changes while allowing the GM and other layers", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player-browser");
    const trusted = await server.joinRoom(room.id, "", "trusted-browser");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted-browser", true, resolve));
    const sceneId = gm.snapshot!.scene.id;
    let serial = 0;
    const send = (socket: typeof gm.socket, changes: Change[]) => sendBatch(socket, { id: `batch-${serial++}`, sceneId, changes });
    const added = await send(gm.socket, [{ type: "add", item: map }]);
    expect(added.applied).toEqual([{ type: "add", item: { ...map, owner: "gm", order: 0 } }]);
    for (const peer of [player, trusted]) {
      const token = { ...map, id: peer.socket.id!, layer: "character" as const, locked: false };
      expect((await send(peer.socket, [{ type: "add", item: token }])).applied).toHaveLength(1);
      const answer = await send(peer.socket, [
        { type: "add", item: { ...map, id: "forbidden" } },
        { type: "update", id: map.id, fields: { position: { x: 100, y: 200 } } },
        { type: "update", id: map.id, fields: { layer: "character" } },
        { type: "delete", id: map.id },
        { type: "update", id: token.id, fields: { layer: "map" } },
        { type: "update", id: token.id, fields: { label: "Allowed" } },
      ]);
      expect(answer.applied).toHaveLength(1);
      expect(answer.refused.map(entry => entry.id)).toEqual(["forbidden", "map", "map", "map", token.id]);
      expect(answer.refused[0].item).toBeNull();
      expect(answer.refused[1].item).toEqual({ ...map, owner: "gm", order: 0 });
    }
    expect((await send(gm.socket, [
      { type: "update", id: map.id, fields: { position: { x: 30, y: 40 } } },
      { type: "delete", id: map.id },
    ])).applied).toHaveLength(2);
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items.map).toBeUndefined();
  } finally { await server.dispose(); }
});
