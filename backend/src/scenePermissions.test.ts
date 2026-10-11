import { expect, test } from "bun:test";
import { ImageItem, ShapeItem } from "../../src/sceneRules";
import { createRoom, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const token: ImageItem = { id: "token", kind: "image", layer: "character", position: { x: 0, y: 0 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: false, hidden: false, metadata: {},
  image: { type: "default", key: "hero" }, width: 150, height: 150, label: "Hero",
  outline: { type: "circle", x: 0, y: 0, radius: 75 } };
const drawing: ShapeItem = { id: "drawing", kind: "shape", layer: "drawing", position: token.position,
  rotation: 0, scale: token.scale, order: 0, owner: "gm", locked: false, hidden: false, metadata: {},
  geometry: { type: "circle", radius: 75 }, color: "red", strokeWidth: 1, fill: false, blend: false, cut: false };

test("socket permissions return real items and use the latest switches and trusted marks", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Permissions");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player");
    const sceneId = gm.snapshot!.scene.id;
    const prepared = await sendBatch(gm.socket, { id: "prepare", sceneId, changes: [{ type: "add", item: token }, { type: "add", item: drawing }] });
    expect(prepared.refused).toEqual([]);
    const refused = await sendBatch(player.socket, { id: "refused", sceneId, changes: [
      { type: "add", item: { ...token, id: "map", layer: "map" } },
      { type: "delete", id: drawing.id },
      { type: "update", id: token.id, fields: { position: { x: 100, y: 100 }, locked: true } },
    ] });
    expect(refused.applied).toEqual([]);
    expect(refused.refused).toEqual([{ id: "map", item: null }, { id: drawing.id, item: drawing }, { id: token.id, item: token }]);
    const own = await sendBatch(player.socket, { id: "own", sceneId, changes: [{ type: "add", item: { ...token, id: "own" } }] });
    expect(own.refused).toEqual([]);
    await new Promise(resolve => gm.socket.emit("room_switches", { tokens: false }, resolve));
    const off = await sendBatch(player.socket, { id: "off", sceneId, changes: [{ type: "update", id: "own", fields: { label: "Changed" } }] });
    expect(off.applied).toEqual([]);
    expect(off.refused).toEqual([{ id: "own", item: { ...token, id: "own", owner: "player", order: 1 } }]);
    await new Promise(resolve => gm.socket.emit("room_trust", "player", true, resolve));
    const trusted = await sendBatch(player.socket, { id: "trusted", sceneId, changes: [
      { type: "update", id: token.id, fields: { label: "Trusted edit" } },
      { type: "update", id: "own", fields: { layer: "map" } },
    ] });
    expect(trusted.applied).toEqual([{ type: "update", id: token.id, fields: { label: "Trusted edit" } }]);
    expect(trusted.refused).toEqual(off.refused);
    await new Promise(resolve => gm.socket.emit("room_trust", "player", false, resolve));
    expect((await sendBatch(player.socket, { id: "untrusted", sceneId, changes: [{ type: "delete", id: "own" }] })).refused).toEqual(off.refused);
    const scene = (await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene;
    expect(scene.items.drawing).toEqual(drawing);
    expect(scene.items.own).toEqual(off.refused[0].item!);
    expect((scene.items.token as ImageItem).label).toBe("Trusted edit");
  } finally { await server.dispose(); }
});
