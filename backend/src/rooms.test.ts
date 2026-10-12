import { tokenItem } from "./testing/sceneFixtures";
import { expect, test } from "bun:test";
import { sendBatch, createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

async function startRoomServer() {
  const server = await startTestServer();
  const { cookie } = await setupAdministrator(server);
  const room = await createRoom(server, cookie, "Room");
  const second = await createRoom(server, cookie, "Second room");
  const protectedRoom = await createRoom(server, cookie, "Protected", "secret");
  return Object.assign(server, { cookie, roomId: room.id, secondRoomId: second.id, protectedRoomId: protectedRoom.id });
}

async function change(server: Awaited<ReturnType<typeof startRoomServer>>, room = server.roomId) {
  const owner = await server.joinRoomAsGM(room, server.cookie);
  await new Promise(resolve => owner.socket.emit("session", true, resolve));
  const observer = await server.joinRoom(room);
  const sceneId = owner.snapshot!.scene!.id;
  await sendBatch(owner.socket, { id: "seed", sceneId, changes: [{ type: "add", item: tokenItem }] });
  return { owner, observer, sceneId };
}

test("a clean stop keeps every room's scene", async () => {
  const server = await startRoomServer();
  try {
    await change(server);
    await change(server, server.secondRoomId);
    await server.restart();
    for (const room of [server.roomId, server.secondRoomId]) {
      expect((await server.joinRoomAsGM(room, server.cookie)).snapshot!.scene!.items.hero).toEqual(tokenItem);
    }
  } finally { await server.dispose(); }
});

test("a room's password still gates new connections after a restart", async () => {
  const server = await startRoomServer();
  try {
    await server.joinRoom(server.protectedRoomId, "secret");
    await server.restart();
    const wrong = server.connect();
    const refused = nextMessage(wrong, "auth_error");
    wrong.emit("join_game", server.protectedRoomId, "incorrect");
    await refused;
    const correct = await server.joinRoom(server.protectedRoomId, "secret");
    expect(correct.token).toBeString();
  } finally { await server.dispose(); }
});

test("the old display link joins after restart without restoring presence, dice, timers, view or freeze", async () => {
  const server = await startRoomServer();
  try {
    const { owner, observer } = await change(server);
    const party = nextMessage(observer.socket, "party_state");
    owner.socket.emit("player_state", { userId: "gm", nickname: "GM", dice: { roll: 20 }, timer: { remaining: 60 } });
    await party;
    const token = await new Promise<string>((resolve) => owner.socket.emit("get_display_token", resolve));
    expect(token).toBeString();
    owner.socket.emit("display_view", { sceneId: owner.snapshot!.scene!.id, x: 1, y: 2, width: 3, height: 4 });
    const frozen = nextMessage(observer.socket, "display_frozen");
    owner.socket.emit("display_freeze", true);
    await frozen;
    await server.restart();
    const display = server.connect();
    const events: string[] = [];
    display.onAny((event) => events.push(event));
    const initialParty = nextMessage(display, "party_state");
    const initialFrozen = nextMessage(display, "display_frozen");
    const joined = nextMessage(display, "joined_display");
    display.emit("join_display", server.roomId, token);
    await joined;
    expect(events).not.toContain("map");
    expect((await initialParty)[0]).toEqual({});
    expect((await initialFrozen)[0]).toBe(false);
    // This acknowledgement follows all initial events on the same connection.
    await new Promise((resolve) => display.emit("get_display_token", resolve));
    expect(events).not.toContain("display_view");
    expect((await server.joinRoomAsGM(server.roomId, server.cookie)).state.partyState).toEqual({});
  } finally { await server.dispose(); }
});

test("saved image references remain downloadable and incremental edits survive restart", async () => {
  const server = await startRoomServer();
  try {
    const { owner, observer } = await change(server);
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const uploaded = await fetch(`${server.address}/assets/image`, {
      method: "PUT", body: image, headers: { Authorization: `Bearer ${owner.token}`,
        "Content-Type": "image/png", "X-Asset-Width": "4", "X-Asset-Height": "2", "X-Asset-Owner": "gm" },
    });
    expect(uploaded.status).toBe(201);
    await uploaded.text();
    await server.clock.advance(3000);
    await sendBatch(owner.socket, { id: "image", sceneId: owner.snapshot!.scene!.id, changes: [
      { type: "update", id: "hero", fields: { image: { type: "file", file: "image" }, label: "The door is open" } },
    ] });
    owner.socket.disconnect();
    observer.socket.disconnect();
    await server.restart();
    const joined = await server.joinRoomAsGM(server.roomId, server.cookie);
    const item = joined.snapshot!.scene!.items.hero;
    expect(item).toEqual({ ...tokenItem, image: { type: "file", file: "image" }, label: "The door is open" });
    for (const token of [joined.token, (await server.joinRoom(server.roomId)).token]) {
      const response = await fetch(`${server.address}/assets/image`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(image);
    }
  } finally { await server.dispose(); }
});

test("a room that disconnects before its save delay still reaches durable storage", async () => {
  const server = await startRoomServer();
  try {
    const { owner, observer } = await change(server);
    const left = nextMessage(observer.socket, "player_left");
    owner.socket.disconnect();
    await left;
    observer.socket.disconnect();
    await server.clock.advance(3000);
    const copy = await server.durableCopy();
    try { expect((await copy.joinRoomAsGM(server.roomId, server.cookie)).snapshot!.scene!.items.hero).toEqual(tokenItem); }
    finally { await copy.dispose(); }
  } finally { await server.dispose(); }
});

test("another item change resets the three-second save delay", async () => {
  const server = await startRoomServer();
  try {
    const { owner, sceneId } = await change(server);
    await server.clock.advance(2000);
    await sendBatch(owner.socket, { id: "latest", sceneId, changes: [{ type: "update", id: "hero", fields: { label: "Latest" } }] });
    await server.clock.advance(2999);
    const before = await server.durableCopy();
    try { expect((await before.joinRoomAsGM(server.roomId, server.cookie)).snapshot!.scene!.items).toEqual({}); }
    finally { await before.dispose(); }
    await server.clock.advance(1);
    const after = await server.durableCopy();
    try { expect((await after.joinRoomAsGM(server.roomId, server.cookie)).snapshot!.scene!.items.hero).toEqual({ ...tokenItem, label: "Latest" }); }
    finally { await after.dispose(); }
  } finally { await server.dispose(); }
});

test("obsolete canvas messages neither relay nor change the saved scene document", async () => {
  const server = await startRoomServer();
  try {
    const { owner, observer } = await change(server);
    const obsolete = ["map", "map_state", "map_state_update", "manifest", "manifest_update"];
    const events: string[] = [];
    for (const peer of [owner.socket, observer.socket]) {
      for (const event of obsolete) peer.on(event, () => events.push(event));
      for (const event of obsolete) peer.emit(event, { id: "obsolete", mapId: "obsolete", assets: {}, changes: [] });
      await new Promise(resolve => peer.emit("get_display_token", resolve));
    }
    expect(events).toEqual([]);
    await server.restart();
    const scene = (await server.joinRoomAsGM(server.roomId, server.cookie)).snapshot!.scene!;
    expect(scene.items).toEqual({ hero: tokenItem });
    const list = await fetch(`${server.address}/api/rooms`, { headers: { Cookie: server.cookie } });
    const rooms = (await list.json() as { rooms: { id: string; sizeBytes: number }[] }).rooms;
    expect(rooms.find(room => room.id === server.roomId)?.sizeBytes).toBe(Buffer.byteLength(JSON.stringify({ openSceneId: scene.id, welcomeSceneId: null, scenes: { [scene.id]: { ...scene, name: "Scene 1" } } })));
  } finally { await server.dispose(); }
});
