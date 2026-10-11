import { ImageItem } from "../../src/sceneRules";
import { expect, test } from "bun:test";
import { createRoom, nextMessage, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const token: ImageItem = { id: "hero", kind: "image", layer: "character", position: { x: 150, y: 300 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 999, owner: "forged", locked: false, hidden: false, metadata: {},
  image: { type: "default", key: "hero" }, width: 150, height: 150, label: "Hero",
  outline: { type: "circle", x: 75, y: 75, radius: 75 } };

test("a GM joins an empty scene and adds an item with server owner and order", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    expect(gm.snapshot?.scene.items).toEqual({});
    const sceneId = gm.snapshot!.scene.id;
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    const relay = nextMessage(player.socket, "scene_changes");
    const answer = nextMessage(gm.socket, "scene_answer");
    gm.socket.emit("scene_changes", { id: "batch", sceneId, changes: [{ type: "add", item: token }] });
    expect((await relay)[0].changes[0].item).toEqual({ ...token, owner: "gm", order: 0 });
    expect((await answer)[0].applied).toHaveLength(1);
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items.hero).toEqual({ ...token, owner: "gm", order: 0 });
  } finally { await server.dispose(); }
});

test("players and cast displays receive scenes only during a session", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id, "", "anonymous-browser");
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    expect(player.snapshot).toBeUndefined();
    expect(display.snapshot).toBeUndefined();
    const sceneId = gm.snapshot!.scene.id;
    const send = async (item: typeof token, id = "batch", namedScene = sceneId) => {
      const answer = nextMessage(player.socket, "scene_answer");
      player.socket.emit("scene_changes", { id, sceneId: namedScene, changes: [{ type: "add", item }] });
      return (await answer)[0];
    };
    expect((await send(token)).refused).toEqual([{ id: "hero", item: null }]);
    const playerSnapshot = nextMessage(player.socket, "scene_snapshot");
    const displaySnapshot = nextMessage(display.socket, "scene_snapshot");
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    expect((await playerSnapshot)[0]).toEqual(gm.snapshot);
    expect((await displaySnapshot)[0]).toEqual(gm.snapshot);
    const gmRelay = nextMessage(gm.socket, "scene_changes");
    const displayRelay = nextMessage(display.socket, "scene_changes");
    expect((await send(token)).applied[0].item.owner).toBe("anonymous-browser");
    expect((await gmRelay)[0]).toEqual((await displayRelay)[0]);
    const events: unknown[] = [];
    gm.socket.on("scene_changes", value => events.push(value));
    expect((await send(token)).refused[0].item.owner).toBe("anonymous-browser");
    expect((await send({ ...token, id: "invalid", rotation: NaN })).applied).toEqual([]);
    expect((await send({ ...token, id: "over-cap", label: "x".repeat(10001) })).applied).toEqual([]);
    expect((await send({ ...token, id: "wrong-scene" }, "wrong", "elsewhere")).applied).toEqual([]);
    const malformedAnswers: unknown[] = [];
    player.socket.on("scene_answer", value => malformedAnswers.push(value));
    player.socket.emit("scene_changes", { changes: [] });
    display.socket.emit("scene_changes", { id: "display", sceneId, changes: [{ type: "add", item: { ...token, id: "display" } }] });
    await new Promise(resolve => display.socket.emit("get_display_token", resolve));
    await new Promise(resolve => player.socket.emit("get_display_token", resolve));
    expect(malformedAnswers).toEqual([]);
    expect(events).toEqual([]);
    const rejoined = await server.joinRoom(room.id);
    expect(rejoined.snapshot!.scene.items.hero.owner).toBe("anonymous-browser");
  } finally { await server.dispose(); }
});

test("scene adds reach durable storage after the save delay and within eight seconds of steady changes", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene.id;
    for (let index = 0; index < 8; index++) {
      const answer = nextMessage(gm.socket, "scene_answer");
      gm.socket.emit("scene_changes", { id: `batch-${index}`, sceneId, changes: [{ type: "add", item: { ...token, id: `hero-${index}` } }] });
      expect((await answer)[0].applied[0].item.order).toBe(index);
      await server.clock.advance(1000);
    }
    const copy = await server.durableCopy();
    try { expect(Object.keys((await copy.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items)).toHaveLength(8); }
    finally { await copy.dispose(); }
    await server.clock.advance(3000);
    const delayed = await server.durableCopy();
    try { expect((await delayed.joinRoomAsGM(room.id, cookie)).snapshot!.scene.id).toBe(sceneId); }
    finally { await delayed.dispose(); }
  } finally { await server.dispose(); }
});


test("one add is saved after three seconds without waiting for a clean stop", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await sendBatch(gm.socket, { id: "add", sceneId: gm.snapshot!.scene.id, changes: [{ type: "add", item: token }] });
    await server.clock.advance(2999);
    const before = await server.durableCopy();
    try { expect((await before.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items).toEqual({}); }
    finally { await before.dispose(); }
    await server.clock.advance(1);
    const after = await server.durableCopy();
    try { expect((await after.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items.hero.owner).toBe("gm"); }
    finally { await after.dispose(); }
  } finally { await server.dispose(); }
});

test("mixed updates and deletes relay applied changes and answer with real refused items", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene.id;
    await sendBatch(gm.socket, { id: "add", sceneId, changes: [{ type: "add", item: token }] });
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player-browser");
    const relay = nextMessage(player.socket, "scene_changes");
    const answer = await sendBatch(gm.socket, { id: "mixed", sceneId, changes: [
      { type: "update", id: "hero", fields: { position: { x: 450, y: 600 } } },
      { type: "add", item: token },
      { type: "update", id: "hero", fields: { rotation: NaN } },
      { type: "delete", id: "hero" },
      { type: "update", id: "hero", fields: { label: "Too late" } },
    ] });
    expect(answer.applied as unknown).toEqual([
      { type: "update", id: "hero", fields: { position: { x: 450, y: 600 }, order: 1 } },
      { type: "delete", id: "hero" },
    ]);
    const moved = { ...token, owner: "gm", order: 1, position: { x: 450, y: 600 } };
    expect(answer.refused).toEqual([{ id: "hero", item: moved }, { id: "hero", item: moved }, { id: "hero", item: null }]);
    expect((await relay)[0]).toEqual({ sceneId, changes: answer.applied });
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.items).toEqual({});
  } finally { await server.dispose(); }
});

test("connections retain independent fields and converge on the server's last write and layer order", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene.id;
    await sendBatch(gm.socket, { id: "seed", sceneId, changes: [
      { type: "add", item: token },
      { type: "add", item: { ...token, id: "prop", layer: "prop" } },
      { type: "add", item: { ...token, id: "map", layer: "map" } },
    ] });
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player-browser");
    const playerEvents: unknown[] = [];
    const gmEvents: unknown[] = [];
    player.socket.on("scene_changes", value => playerEvents.push(value));
    gm.socket.on("scene_changes", value => gmEvents.push(value));
    const move = await sendBatch(gm.socket, { id: "move", sceneId, changes: [
      { type: "update", id: "hero", fields: { position: { x: 300, y: 300 } } },
    ] });
    expect(move.applied as unknown).toEqual([{ type: "update", id: "hero", fields: { position: { x: 300, y: 300 }, order: 1 } }]);
    const label = await sendBatch(player.socket, { id: "label", sceneId, changes: [
      { type: "update", id: "hero", fields: { label: "Player label" } },
    ] });
    expect(label.applied).toEqual([{ type: "update", id: "hero", fields: { label: "Player label" } }]);
    const last = await sendBatch(player.socket, { id: "last", sceneId, changes: [
      { type: "update", id: "hero", fields: { position: { x: 900, y: 750 } } },
      { type: "update", id: "hero", fields: { layer: "prop" } },
      { type: "update", id: "map", fields: { position: { x: -150, y: 0 } } },
    ] });
    expect(last.applied as unknown).toEqual([
      { type: "update", id: "hero", fields: { position: { x: 900, y: 750 }, order: 2 } },
      { type: "update", id: "hero", fields: { layer: "prop", order: 1 } },
      { type: "update", id: "map", fields: { position: { x: -150, y: 0 } } },
    ]);
    const current = (await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene;
    expect(current.items.hero).toEqual({ ...token, owner: "gm", layer: "prop", order: 1,
      position: { x: 900, y: 750 }, label: "Player label" });
    expect(playerEvents).toEqual([{ sceneId, changes: move.applied }]);
    expect(gmEvents).toEqual([{ sceneId, changes: label.applied }, { sceneId, changes: last.applied }]);
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene).toEqual(current);
  } finally { await server.dispose(); }
});
