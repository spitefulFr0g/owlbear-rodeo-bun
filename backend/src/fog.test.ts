import { expect, test } from "bun:test";
import { CurveItem, Item } from "../../src/sceneRules";
import { createRoom, nextMessage, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const curve: CurveItem = {
  id: "brush", kind: "curve", layer: "drawing", position: { x: -300, y: 600 },
  rotation: 0, scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: false,
  hidden: false, metadata: {}, points: [{ x: 0, y: 0 }, { x: 150, y: 150 }],
  closed: false, color: "red", strokeWidth: 15, fill: false, blend: false, cut: false,
};

test("fog shapes, holes, cuts and hidden flags survive restart and remove only for connections that saw them", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Fog");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene!.id;
    const base = { id: "", layer: "fog" as const, position: curve.position, rotation: 0, scale: curve.scale,
      order: 0, owner: "gm", locked: false, hidden: false, metadata: {}, color: curve.color, strokeWidth: 15, blend: false };
    const items: Item[] = [
      { ...curve, layer: "fog", cut: true, id: "marker", closed: true, fill: true, strokeWidth: 0, blend: true, points: [...curve.points, { x: 150, y: 0 }] },

      ...[
        { type: "rectangle" as const, width: -150, height: 300 },
        { type: "polygon" as const, points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }], holes: [[{ x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }]] },
        { type: "triangle" as const, points: [...curve.points, { x: 150, y: 0 }] },
      ].map((geometry, index): Item => ({ ...base, kind: "shape", id: `shape-${index}`, geometry, hidden: index === 1, fill: true, cut: false })),
    ];
    const answer = await sendBatch(gm.socket, { id: "draw", sceneId, changes: items.map(item => ({ type: "add", item })) });
    expect(answer.refused).toEqual([]);
    const saved = (await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene;
    await server.restart();
    const rejoined = await server.joinRoomAsGM(room.id, cookie);
    expect(rejoined.snapshot!.scene).toEqual(saved);
    await new Promise(resolve => rejoined.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    expect(player.snapshot!.scene!.items["shape-1"]).toBeUndefined();
    const relay = nextMessage(player.socket, "scene_changes");
    const erased = await sendBatch(rejoined.socket, { id: "erase", sceneId, changes: items.map(item => ({ type: "delete", id: item.id })) });
    expect(erased.refused).toEqual([]);
    expect((await relay)[0]).toEqual({ sceneId, changes: items.filter(item => !item.hidden).map(item => ({ type: "delete", id: item.id })) });
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene!.items).toEqual({});
  } finally { await server.dispose(); }
});
