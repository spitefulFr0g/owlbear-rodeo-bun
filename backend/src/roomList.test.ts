import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

function request(server: { address: string }, method: string, path = "/api/rooms", cookie = "", body?: unknown) {
  return fetch(`${server.address}${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: method === "GET" || body === undefined ? undefined : JSON.stringify(body) });
}

test("an account creates named rooms with server links and lists them by name", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const response = await request(server, "POST", undefined, cookie, { name: "  Zebra  " });
    expect(response.status).toBe(201);
    const { room } = await response.json() as any;
    expect(room).toEqual({ id: expect.stringMatching(/^[A-Za-z0-9]{16}$/), name: "Zebra", hasPassword: false, sizeBytes: 2 });
    const second = await request(server, "POST", undefined, cookie, { name: "Alpha", password: "secret" });
    const { room: alpha } = await second.json() as any;
    expect(alpha.id).not.toBe(room.id);
    expect(alpha.hasPassword).toBe(true);
    expect(await (await request(server, "GET", undefined, cookie)).json()).toEqual({ rooms: [alpha, room] });
  } finally { await server.dispose(); }
});

test("room routes require a sign-in and reject invalid names without creating rooms", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    for (const [method, path] of [["GET", "/api/rooms"], ["POST", "/api/rooms"], ["PATCH", "/api/rooms/missing"]]) {
      const response = await request(server, method, path, "", { name: "Room" });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "not_signed_in", message: expect.any(String) });
    }
    for (const name of ["", "   ", "a".repeat(65), null, 42]) {
      const response = await request(server, "POST", undefined, cookie, { name });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "room_name_invalid" });
    }
    expect(await (await request(server, "GET", undefined, cookie)).json()).toEqual({ rooms: [] });
    expect((await request(server, "POST", undefined, cookie, { name: "a".repeat(64) })).status).toBe(201);
  } finally { await server.dispose(); }
});


test("joining carries the name and renaming reaches players and cast displays without changing the link", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Before");
    const player = server.connect();
    const joined = nextMessage(player, "joined_game");
    player.emit("join_game", room.id, "");
    expect((await joined)[2]).toEqual({ room: { name: "Before" } });
    const peer = await server.joinRoom(room.id);
    const party = nextMessage(peer.socket, "party_state");
    player.emit("player_state", { userId: "gm" });
    await party;
    const map = nextMessage(peer.socket, "map");
    player.emit("map", { id: "map", owner: "gm" });
    await map;
    const displayToken = await new Promise<string>(resolve => player.emit("get_display_token", resolve));
    const display = server.connect();
    const displayJoined = nextMessage(display, "joined_display");
    display.emit("join_display", room.id, displayToken);
    expect((await displayJoined)[2]).toEqual({ room: { name: "Before" } });
    const notifications = [player, peer.socket, display].map(socket => nextMessage(socket, "room_state"));
    const response = await request(server, "PATCH", `/api/rooms/${room.id}`, cookie, { name: "  After  " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ room: { ...room, name: "After", sizeBytes: 33 } });
    for (const notification of notifications) expect(await notification).toEqual([{ name: "After" }]);
    expect(await (await request(server, "GET", undefined, cookie)).json()).toEqual({ rooms: [{ ...room, name: "After", sizeBytes: 33 }] });
    await server.joinRoom(room.id);
  } finally { await server.dispose(); }
});

test("password rooms refuse missing and wrong passwords while empty passwords need none, including after restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const protectedRoom = await createRoom(server, cookie, "Protected", "room-password");
    const openRoom = await createRoom(server, cookie, "Open", "");
    await server.restart();
    for (const password of ["", "wrong"]) {
      const socket = server.connect();
      const refused = nextMessage(socket, "auth_error");
      socket.emit("join_game", protectedRoom.id, password);
      expect(await refused).toEqual([]);
      socket.disconnect();
    }
    await server.joinRoom(protectedRoom.id, "room-password");
    await server.joinRoom(openRoom.id);
    expect(await (await request(server, "GET", undefined, cookie)).json()).toEqual({ rooms: [openRoom, protectedRoom] });
  } finally { await server.dispose(); }
});

test("renamed rooms keep their GM, name, document and link across restart and immediate durable recovery", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Before");
    const player = await server.joinRoom(room.id);
    player.socket.emit("map", { id: "saved", owner: "gm" });
    const peer = await server.joinRoom(room.id);
    expect(peer.state.map).toEqual({ id: "saved", owner: "gm" });
    expect((await request(server, "PATCH", `/api/rooms/${room.id}`, cookie, { name: "After" })).status).toBe(200);
    const copy = await server.durableCopy();
    try {
      expect(await (await request(copy, "GET", undefined, cookie)).json()).toEqual({ rooms: [{ ...room, name: "After", sizeBytes: 35 }] });
      expect((await copy.joinRoom(room.id)).state.map).toEqual({ id: "saved", owner: "gm" });
    } finally { await copy.dispose(); }
    await server.restart();
    expect(await (await request(server, "GET", undefined, cookie)).json()).toEqual({ rooms: [{ ...room, name: "After", sizeBytes: 35 }] });
    expect((await request(server, "PATCH", `/api/rooms/${room.id}`, cookie, { name: "Again" })).status).toBe(200);
    expect((await server.joinRoom(room.id)).state.map).toEqual({ id: "saved", owner: "gm" });
  } finally { await server.dispose(); }
});

test("unknown joined rooms have no GM or list entry and invalid renames change nothing", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const socket = server.connect();
    const joined = nextMessage(socket, "joined_game");
    socket.emit("join_game", "legacy-room", "");
    expect((await joined)[2]).toEqual({ room: { name: "" } });
    expect(await (await request(server, "GET", undefined, cookie)).json()).toEqual({ rooms: [] });
    const forbidden = await request(server, "PATCH", "/api/rooms/legacy-room", cookie, { name: "Stolen" });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: "not_room_gm" });
    const missing = await request(server, "PATCH", "/api/rooms/unknown", cookie, { name: "Missing" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: "room_not_found" });
    const room = await createRoom(server, cookie, "Unchanged");
    for (const name of [" ", "x".repeat(65), null]) {
      const response = await request(server, "PATCH", `/api/rooms/${room.id}`, cookie, { name });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "room_name_invalid" });
    }
    expect(await (await request(server, "GET", undefined, cookie)).json()).toEqual({ rooms: [room] });
    await server.restart();
    const rejoined = server.connect();
    const info = nextMessage(rejoined, "joined_game");
    rejoined.emit("join_game", "legacy-room", "");
    expect((await info)[2]).toEqual({ room: { name: "" } });
  } finally { await server.dispose(); }
});

test("room changes reject foreign origins and malformed names leave the list unchanged", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Original");
    for (const [method, path] of [["POST", "/api/rooms"], ["PATCH", `/api/rooms/${room.id}`]]) {
      const response = await fetch(`${server.address}${path}`, {
        method, headers: { Cookie: cookie, Origin: "https://foreign.example", "Content-Type": "application/json" }, body: JSON.stringify({ name: "Changed" }),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "origin_not_allowed", message: expect.any(String) });
      const malformed = await fetch(`${server.address}${path}`, {
        method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{",
      });
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toMatchObject({ error: "room_name_invalid" });
    }
    expect(await (await request(server, "GET", undefined, cookie)).json()).toEqual({ rooms: [room] });
  } finally { await server.dispose(); }
});
