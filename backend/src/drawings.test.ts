import { expect, test } from "bun:test";
import { CurveItem, Item, maxPoints } from "../../src/sceneRules";
import { createRoom, nextMessage, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const curve: CurveItem = {
  id: "brush", kind: "curve", layer: "drawing", position: { x: -300, y: 600 },
  rotation: 0, scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: false,
  hidden: false, metadata: {}, points: [{ x: 0, y: 0 }, { x: 150, y: 150 }],
  closed: false, color: "red", strokeWidth: 15, fill: false, blend: false, cut: false,
};

test("a stroke at the point cap reaches everyone and survives restart; an extra point is refused", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Drawings");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    const sceneId = gm.snapshot!.scene.id;
    const points = Array.from({ length: maxPoints }, (_, x) => ({ x, y: x % 2 }));
    const accepted = { ...curve, points };
    const relay = nextMessage(player.socket, "scene_changes");
    const answer = await sendBatch(gm.socket, { id: "draw", sceneId, changes: [
      { type: "add", item: accepted },
      { type: "add", item: { ...curve, id: "too-long", points: [...points, { x: maxPoints, y: 0 }] } },
    ] });
    expect(answer.applied).toEqual([{ type: "add", item: accepted }]);
    expect(answer.refused).toEqual([{ id: "too-long", item: null }]);
    expect((await relay)[0]).toEqual({ sceneId, changes: answer.applied });
    const refusedEdit = await sendBatch(gm.socket, { id: "extend", sceneId, changes: [
      { type: "update", id: curve.id, fields: { points: [...points, { x: maxPoints, y: 0 }] } },
    ] });
    expect(refusedEdit.applied).toEqual([]);
    expect(refusedEdit.refused).toEqual([{ id: curve.id, item: accepted }]);
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items).toEqual({ brush: accepted });
  } finally { await server.dispose(); }
});

test("shape, marker and line drawings keep geometry and style across restart and erase for everyone", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Drawings");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene.id;
    const base = { id: "", layer: curve.layer, position: curve.position, rotation: 0, scale: curve.scale,
      order: 0, owner: "gm", locked: false, hidden: false, metadata: {}, color: curve.color, strokeWidth: 15, blend: false };
    const items: Item[] = [
      { ...curve, id: "marker", closed: true, fill: true, strokeWidth: 0, blend: true, points: [...curve.points, { x: 150, y: 0 }] },
      { ...base, kind: "line", id: "line", points: curve.points },
      ...[
        { type: "rectangle" as const, width: -150, height: 300 },
        { type: "circle" as const, radius: 75 },
        { type: "triangle" as const, points: [...curve.points, { x: 150, y: 0 }] },
      ].map((geometry, index): Item => ({ ...base, kind: "shape", id: `shape-${index}`, geometry, fill: false, cut: false })),
    ];
    const answer = await sendBatch(gm.socket, { id: "draw", sceneId, changes: items.map(item => ({ type: "add", item })) });
    expect(answer.refused).toEqual([]);
    const saved = (await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene;
    await server.restart();
    const rejoined = await server.joinRoomAsGM(room.id, cookie);
    expect(rejoined.snapshot!.scene).toEqual(saved);
    await new Promise(resolve => rejoined.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    const relay = nextMessage(player.socket, "scene_changes");
    const erased = await sendBatch(rejoined.socket, { id: "erase", sceneId, changes: items.map(item => ({ type: "delete", id: item.id })) });
    expect(erased.refused).toEqual([]);
    expect((await relay)[0]).toEqual({ sceneId, changes: erased.applied });
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items).toEqual({});
  } finally { await server.dispose(); }
});
