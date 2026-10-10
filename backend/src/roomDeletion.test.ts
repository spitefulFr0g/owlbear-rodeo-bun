import { expect, test } from "bun:test";
import { createHash } from "crypto";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import { join } from "path";
import { createRoom, inviteAccount, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

type Server = Awaited<ReturnType<typeof startTestServer>>;
const remove = (server: Server, id: string, cookie?: string, origin?: string) => fetch(`${server.address}/api/rooms/${id}`, {
  method: "DELETE", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
});

test("only the room's GM can delete it and deleted rooms stay gone after restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const other = await inviteAccount(server, cookie, "Other", "test-password");
    const room = await createRoom(server, other.cookie, "Room");
    expect((await remove(server, room.id)).status).toBe(401);
    const forbidden = await remove(server, room.id, cookie);
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json() as any).error).toBe("not_room_gm");
    expect((await remove(server, room.id, other.cookie, "https://elsewhere.example")).status).toBe(403);
    const unknown = await remove(server, "unknown", other.cookie);
    expect(unknown.status).toBe(404);
    expect((await unknown.json() as any).error).toBe("room_not_found");
    expect((await remove(server, room.id, other.cookie)).status).toBe(204);
    await server.clock.advance(8000);
    await server.restart();
    const list = await fetch(`${server.address}/api/rooms`, { headers: { Cookie: other.cookie } });
    expect((await list.json() as any).rooms).toEqual([]);
    const socket = server.connect();
    const refused = nextMessage(socket, "room_not_found");
    socket.emit("join_game", room.id, "");
    expect(await refused).toEqual([]);
  } finally { await server.dispose(); }
});

test("deleting a room tells every player and cast display before disconnecting and revokes their asset tokens", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const writer = await server.joinRoom(room.id);
    const player = await server.joinRoom(room.id);
    const party = nextMessage(player.socket, "party_state");
    writer.socket.emit("player_state", { userId: "gm" });
    await party;
    const map = nextMessage(player.socket, "map");
    writer.socket.emit("map", { id: "map", owner: "gm" });
    await map;
    const displayToken = await new Promise<string>(resolve => writer.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    const connections = [writer, player, display];
    const messages = connections.map(({ socket }) => {
      const events: string[] = [];
      socket.on("room_deleted", (...args) => { expect(args).toEqual([]); events.push("room_deleted"); });
      return nextMessage(socket, "disconnect").then(([reason]) => {
        events.push("disconnect");
        expect(reason).toBe("io server disconnect");
        expect(events).toEqual(["room_deleted", "disconnect"]);
      });
    });
    expect((await remove(server, room.id, cookie)).status).toBe(204);
    await Promise.all(messages);
    for (const { token } of connections) {
      for (const method of ["GET", "HEAD", "PUT"]) {
        expect((await fetch(`${server.address}/assets/image`, { method, headers: imageHeaders(token),
          ...(method === "PUT" ? { body: "image" } : {}) })).status).toBe(401);
      }
    }
    await server.clock.advance(8000);
    const copy = await server.durableCopy();
    try {
      const socket = copy.connect();
      const missing = nextMessage(socket, "room_not_found");
      socket.emit("join_game", room.id, "");
      expect(await missing).toEqual([]);
    } finally { await copy.dispose(); }
    const socket = server.connect();
    const refused = nextMessage(socket, "display_error");
    socket.emit("join_display", room.id, displayToken);
    expect(await refused).toEqual([]);
  } finally { await server.dispose(); }
});

const imageHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "image/png",
  "X-Asset-Width": "1", "X-Asset-Height": "1", "X-Asset-Owner": "gm" });

for (const method of ["HEAD", "GET", "PUT"] as const) {
  test(`deleting a room removes its exclusive images but preserves images another room used through ${method}`, async () => {
    const server = await startTestServer();
    try {
      const { cookie } = await setupAdministrator(server);
      const first = await createRoom(server, cookie, "First");
      const second = await createRoom(server, cookie, "Second");
      const uploader = await server.joinRoom(first.id);
      const reader = await server.joinRoom(second.id);
      for (const [id, body] of [["exclusive", "exclusive bytes"], ["shared", "shared bytes"], ["same-hash", "shared bytes"]]) {
        const upload = await fetch(`${server.address}/assets/${id}`, { method: "PUT", headers: imageHeaders(uploader.token), body });
        expect(upload.status).toBe(201);
        await upload.text();
      }
      const used = await fetch(`${server.address}/assets/shared`, { method, headers: imageHeaders(reader.token), ...(method === "PUT" ? { body: "ignored" } : {}) });
      expect(used.status).toBe(method === "PUT" ? 409 : 200);
      await used.text();
      expect((await remove(server, first.id, cookie)).status).toBe(204);
      for (const id of ["exclusive", "same-hash"]) {
        const response = await fetch(`${server.address}/assets/${id}`, { headers: imageHeaders(reader.token) });
        expect(response.status).toBe(404);
      }
      const shared = await fetch(`${server.address}/assets/shared`, { headers: imageHeaders(reader.token) });
      expect(shared.status).toBe(200);
      expect(await shared.text()).toBe("shared bytes");
      await server.restart();
      const joined = await server.joinRoom(second.id);
      const saved = await fetch(`${server.address}/assets/shared`, { headers: imageHeaders(joined.token) });
      expect(saved.status).toBe(200);
      expect(await saved.text()).toBe("shared bytes");
      expect((await remove(server, second.id, cookie)).status).toBe(204);
      const third = await createRoom(server, cookie, "Third");
      const last = await server.joinRoom(third.id);
      expect((await fetch(`${server.address}/assets/shared`, { headers: imageHeaders(last.token) })).status).toBe(404);
    } finally { await server.dispose(); }
  });
}

test("a room deleted during a password check refuses the pending join", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Protected", "secret");
    const socket = server.connect();
    await nextMessage(socket, "connect");
    const refused = nextMessage(socket, "room_not_found");
    socket.emit("join_game", room.id, "secret");
    // The next socket event is acknowledged while the password hash is pending.
    await new Promise(resolve => socket.emit("get_display_token", resolve));
    expect((await remove(server, room.id, cookie)).status).toBe(204);
    expect(await refused).toEqual([]);
  } finally { await server.dispose(); }
});

test("deleting a room frees its image files and keeps images no room has used", async () => {
  let directory = "";
  const legacyHash = createHash("sha256").update("legacy bytes").digest("hex");
  const exclusiveHash = createHash("sha256").update("exclusive bytes").digest("hex");
  const server = await startTestServer(async dataDir => {
    directory = dataDir;
    const refs = join(dataDir, "assets", "refs");
    const blobs = join(dataDir, "assets", "blobs", legacyHash.slice(0, 2));
    await mkdir(refs, { recursive: true });
    await mkdir(blobs, { recursive: true });
    await writeFile(join(blobs, legacyHash), "legacy bytes");
    await writeFile(join(refs, "legacy.json"), JSON.stringify({ id: "legacy", hash: legacyHash, size: 12,
      mime: "image/png", width: 1, height: 1, owner: "gm", createdAt: "2025-01-01T00:00:00.000Z" }));
  });
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const writer = await server.joinRoom(room.id);
    const upload = await fetch(`${server.address}/assets/exclusive`, { method: "PUT", headers: imageHeaders(writer.token), body: "exclusive bytes" });
    expect(upload.status).toBe(201);
    await upload.text();
    expect((await remove(server, room.id, cookie)).status).toBe(204);
    // Disk space is observable at the filesystem boundary, without reading SQLite.
    expect(await stat(join(directory, "assets", "blobs", exclusiveHash.slice(0, 2), exclusiveHash)).catch(error => error.code)).toBe("ENOENT");
    await server.restart();
    const second = await createRoom(server, cookie, "Second");
    const reader = await server.joinRoom(second.id);
    const untouched = await fetch(`${server.address}/assets/legacy`, { headers: imageHeaders(reader.token) });
    expect(untouched.status).toBe(200);
    expect(await untouched.text()).toBe("legacy bytes");
  } finally { await server.dispose(); }
});

test("file cleanup failure leaves the room and exclusive image records deleted while surviving images still load", async () => {
  let directory = "";
  const server = await startTestServer(async dataDir => { directory = dataDir; });
  try {
    const { cookie } = await setupAdministrator(server);
    const first = await createRoom(server, cookie, "First");
    const second = await createRoom(server, cookie, "Second");
    const writer = await server.joinRoom(first.id);
    const reader = await server.joinRoom(second.id);
    for (const id of ["exclusive", "shared"]) {
      const uploaded = await fetch(`${server.address}/assets/${id}`, { method: "PUT", headers: imageHeaders(writer.token), body: id });
      expect(uploaded.status).toBe(201);
      await uploaded.text();
    }
    const used = await fetch(`${server.address}/assets/shared`, { method: "HEAD", headers: imageHeaders(reader.token) });
    expect(used.status).toBe(200);
    const hash = createHash("sha256").update("exclusive").digest("hex");
    const path = join(directory, "assets", "blobs", hash.slice(0, 2), hash);
    // Inject a filesystem failure after uploads through HTTP; no server internals are mocked.
    await rm(path);
    await mkdir(path);
    expect((await remove(server, first.id, cookie)).status).toBe(500);
    // Recover durable files without the clean-stop save, as after a crash
    // between committing the records and finishing file cleanup.
    const recovered = await server.durableCopy();
    try {
      const rooms = await fetch(`${recovered.address}/api/rooms`, { headers: { Cookie: cookie } });
      expect((await rooms.json() as any).rooms.map((room: any) => room.id)).toEqual([second.id]);
      const joined = await recovered.joinRoom(second.id);
      expect((await fetch(`${recovered.address}/assets/exclusive`, { headers: imageHeaders(joined.token) })).status).toBe(404);
      const shared = await fetch(`${recovered.address}/assets/shared`, { headers: imageHeaders(joined.token) });
      expect(shared.status).toBe(200);
      expect(await shared.text()).toBe("shared");
    } finally { await recovered.dispose(); }
  } finally { await server.dispose(); }
});
