import { expect, test } from "bun:test";
import { Change, ImageItem } from "../../src/sceneRules";
import { createRoom, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const token: ImageItem = { id: "token", kind: "image", layer: "character", position: { x: 0, y: 0 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "player", locked: false, hidden: false, metadata: {},
  image: { type: "default", key: "hero" }, width: 150, height: 150, label: "Hero",
  outline: { type: "circle", x: 0, y: 0, radius: 75 } };

for (const trusted of [false, true]) {
  test(`view-only refuses every socket item change from a ${trusted ? "trusted player" : "player"} and allows the GM`, async () => {
    const server = await startTestServer();
    try {
      const { cookie } = await setupAdministrator(server);
      const room = await createRoom(server, cookie, "Handout");
      const gm = await server.joinRoomAsGM(room.id, cookie);
      await new Promise(resolve => gm.socket.emit("session", true, resolve));
      await new Promise(resolve => gm.socket.emit("room_switches", {
        tokens: true, drawing: true, notes: true, fog: true, uploads: true, ownerOnly: false,
      }, resolve));
      const player = await server.joinRoom(room.id, "", "player");
      await new Promise(resolve => gm.socket.emit("room_trust", "player", trusted, resolve));
      const sceneId = gm.snapshot!.scene.id;
      expect((await sendBatch(player.socket, { id: "prepare", sceneId, changes: [{ type: "add", item: token }] })).refused).toEqual([]);
      await new Promise(resolve => gm.socket.emit("scene_settings", { sceneId, viewOnly: true }, resolve));
      const changes: Change[] = [
        { type: "add", item: { ...token, id: "new" } },
        { type: "update", id: token.id, fields: { position: { x: 100, y: 100 } } },
        { type: "delete", id: token.id },
      ];
      const refused = await sendBatch(player.socket, { id: "view-only", sceneId, changes });
      expect(refused.applied).toEqual([]);
      expect(refused.refused).toEqual([{ id: "new", item: null }, { id: token.id, item: token }, { id: token.id, item: token }]);
      expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items).toEqual({ token });
      const allowed = await sendBatch(gm.socket, { id: "gm", sceneId, changes });
      expect(allowed.refused).toEqual([]);
      expect(allowed.applied).toHaveLength(3);
      await new Promise(resolve => gm.socket.emit("scene_settings", { sceneId, viewOnly: false }, resolve));
      expect((await sendBatch(player.socket, { id: "editable", sceneId, changes: [{ type: "add", item: token }] })).refused).toEqual([]);
    } finally { await server.dispose(); }
  });
}
