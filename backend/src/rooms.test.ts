import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

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
  const map = { id: "map-one", owner: "gm", type: "file", file: "image" };
  const state = { mapId: "map-one", tokens: { hero: { x: 12, y: 34 } },
    drawings: { path: [1, 2, 3] }, fogs: { hidden: [4, 5] }, notes: { note: "Remember the door" } };
  const manifest = { mapId: "map-one", assets: { image: { id: "image", owner: "gm" } } };
  for (const [event, value] of [["map", map], ["map_state", state], ["manifest", manifest]] as const) {
    const received = nextMessage(observer.socket, event);
    owner.socket.emit(event, value);
    await received;
  }
  return { owner, observer, map, state, manifest };
}

test("a clean stop keeps every room's map, placed state and image list", async () => {
  const server = await startRoomServer();
  try {
    const expected = await change(server);
    await change(server, server.secondRoomId);
    await server.restart();
    for (const room of [server.roomId, server.secondRoomId]) {
      const joined = await server.joinRoomAsGM(room, server.cookie);
      expect(joined.state.map).toEqual(expected.map);
      expect(joined.state.mapState).toEqual(expected.state);
      expect(joined.state.manifest).toEqual(expected.manifest);
    }
  } finally { await server.dispose(); }
});

test("a room change is saved three seconds after the last change", async () => {
  const server = await startRoomServer();
  try {
    const { owner, observer, map } = await change(server);
    await server.clock.advance(2000);
    const received = nextMessage(observer.socket, "map");
    owner.socket.emit("map", { ...map, name: "Latest map" });
    await received;
    await server.clock.advance(2999);
    const before = await server.durableCopy();
    try { expect((await before.joinRoomAsGM(server.roomId, server.cookie)).state.map).toBeUndefined(); }
    finally { await before.dispose(); }
    await server.clock.advance(1);
    const after = await server.durableCopy();
    try { expect((await after.joinRoomAsGM(server.roomId, server.cookie)).state.map.name).toBe("Latest map"); }
    finally { await after.dispose(); }
  } finally { await server.dispose(); }
});

test("steady room changes are saved within eight seconds", async () => {
  const server = await startRoomServer();
  try {
    const { owner, observer, map } = await change(server);
    for (let second = 1; second <= 7; second++) {
      await server.clock.advance(1000);
      const received = nextMessage(observer.socket, "map");
      owner.socket.emit("map", { ...map, name: `Revision ${second}` });
      await received;
    }
    await server.clock.advance(1000);
    const copy = await server.durableCopy();
    try { expect((await copy.joinRoomAsGM(server.roomId, server.cookie)).state.map.name).toBe("Revision 7"); }
    finally { await copy.dispose(); }
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
    const { owner, observer, map } = await change(server);
    const party = nextMessage(observer.socket, "party_state");
    owner.socket.emit("player_state", { userId: "gm", nickname: "GM", dice: { roll: 20 }, timer: { remaining: 60 } });
    await party;
    const token = await new Promise<string>((resolve) => owner.socket.emit("get_display_token", resolve));
    expect(token).toBeString();
    owner.socket.emit("display_view", { mapId: map.id, x: 1, y: 2, width: 3, height: 4 });
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
    for (const [event, changes] of [
      ["map_state_update", [{ kind: "E", path: ["notes", "note"], lhs: "Remember the door", rhs: "The door is open" }]],
      ["manifest_update", [{ kind: "N", path: ["assets", "token"], rhs: { id: "image", owner: "gm" } }]],
    ] as const) {
      const received = nextMessage(observer.socket, event);
      owner.socket.emit(event, { id: "map-one", changes });
      await received;
    }
    owner.socket.disconnect();
    observer.socket.disconnect();
    await server.restart();
    const joined = await server.joinRoomAsGM(server.roomId, server.cookie);
    expect(joined.state.mapState.notes.note).toBe("The door is open");
    expect(joined.state.manifest.assets.token).toEqual({ id: "image", owner: "gm" });
    for (const asset of Object.values(joined.state.manifest.assets) as { id: string }[]) {
      const response = await fetch(`${server.address}/assets/${asset.id}`, {
        headers: { Authorization: `Bearer ${joined.token}` },
      });
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(image);
    }
  } finally { await server.dispose(); }
});

test("a room that disconnects before its save delay still reaches durable storage", async () => {
  const server = await startRoomServer();
  try {
    const { owner, observer, state } = await change(server);
    const left = nextMessage(observer.socket, "player_left");
    owner.socket.disconnect();
    await left;
    observer.socket.disconnect();
    await server.clock.advance(3000);
    const copy = await server.durableCopy();
    try { expect((await copy.joinRoomAsGM(server.roomId, server.cookie)).state.mapState).toEqual(state); }
    finally { await copy.dispose(); }
  } finally { await server.dispose(); }
});
