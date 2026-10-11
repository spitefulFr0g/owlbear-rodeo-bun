import { expect, test } from "bun:test";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { createHash } from "crypto";
import { nextMessage, createRoom, setupAdministrator, startTestServer } from "./testing/serverHelpers";

test("room creation, listing and renaming answer the saved document size", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    expect(room.sizeBytes).toBe(279); // The initial version 2 document includes an empty scene and legacy state.
    const list = await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } });
    expect((await list.json() as any).rooms[0].sizeBytes).toBe(279);
    const renamed = await fetch(`${server.address}/api/rooms/${room.id}`, {
      method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Renamed" }),
    });
    expect((await renamed.json() as any).room.sizeBytes).toBe(279);
  } finally { await server.dispose(); }
});

const imageHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "image/png",
  "X-Asset-Width": "1", "X-Asset-Height": "1", "X-Asset-Owner": "player" });

for (const method of ["PUT", "HEAD", "GET"] as const) {
  test(`${method} records a shared image once for each room and keeps usage after restart`, async () => {
    const server = await startTestServer();
    try {
      const { cookie } = await setupAdministrator(server);
      const first = await createRoom(server, cookie, "First");
      const second = await createRoom(server, cookie, "Second");
      const uploader = await server.joinRoomAsGM(first.id, cookie);
      const reader = await server.joinRoomAsGM(second.id, cookie);
      const upload = await fetch(`${server.address}/assets/image`, { method: "PUT", headers: imageHeaders(uploader.token), body: "12345678" });
      expect(upload.status).toBe(201);
      await upload.text();
      const sizes = async () => (await (await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } })).json() as any).rooms.map((room: any) => room.sizeBytes);
      expect(await sizes()).toEqual([287, 279]);
      for (let repeat = 0; repeat < 2; repeat++) {
        const response = await fetch(`${server.address}/assets/image`, { method, headers: imageHeaders(reader.token), ...(method === "PUT" ? { body: "ignored" } : {}) });
        expect(response.status).toBe(method === "PUT" ? 409 : 200);
        if (method === "GET") expect(await response.text()).toBe("12345678");
        else await response.text();
      }
      expect(await sizes()).toEqual([287, 287]);
      await server.restart();
      expect(await sizes()).toEqual([287, 287]);
    } finally { await server.dispose(); }
  });
}


test("legacy images count only after first use, including a cast display download", async () => {
  const bytes = "old image";
  const hash = createHash("sha256").update(bytes).digest("hex");
  const server = await startTestServer(async dataDir => {
    const refs = join(dataDir, "assets", "refs");
    const blobs = join(dataDir, "assets", "blobs", hash.slice(0, 2));
    await mkdir(refs, { recursive: true });
    await mkdir(blobs, { recursive: true });
    await writeFile(join(blobs, hash), bytes);
    await writeFile(join(refs, "legacy.json"), JSON.stringify({ id: "legacy", hash, size: 9,
      mime: "image/png", width: 1, height: 1, owner: "gm", createdAt: "2025-01-01T00:00:00.000Z" }));
  });
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    expect(room.sizeBytes).toBe(279);
    const player = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => player.socket.emit("session", true, resolve));
    const observer = await server.joinRoom(room.id);
    const party = nextMessage(observer.socket, "party_state");
    player.socket.emit("player_state", { userId: "gm" });
    await party;
    const map = nextMessage(observer.socket, "map");
    player.socket.emit("map", { owner: "gm" });
    await map;
    await server.clock.advance(3000);
    const displayToken = await new Promise<string>(resolve => player.socket.emit("get_display_token", resolve));
    const display = server.connect();
    const joined = nextMessage(display, "joined_display");
    display.emit("join_display", room.id, displayToken);
    const [, token] = await joined;
    const unauthenticated = await fetch(`${server.address}/assets/legacy`);
    expect(unauthenticated.status).toBe(401);
    const response = await fetch(`${server.address}/assets/legacy`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(bytes);
    await server.restart();
    const list = await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } });
    expect((await list.json() as any).rooms[0].sizeBytes).toBe(308); // Version 2 envelope, legacy map (22 bytes), and nine-byte image.
  } finally { await server.dispose(); }
});

test("room size counts saved document UTF-8 bytes and changes only after saving", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const writer = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => writer.socket.emit("session", true, resolve));
    const observer = await server.joinRoom(room.id);
    const received = nextMessage(observer.socket, "map");
    writer.socket.emit("map", { name: "é" });
    await received;
    const size = async () => (await (await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } })).json() as any).rooms[0].sizeBytes;
    expect(await size()).toBe(279);
    await server.clock.advance(3000);
    // The legacy map adds 19 UTF-8 bytes to the empty document.
    expect(await size()).toBe(298);
    await server.restart();
    expect(await size()).toBe(298);
  } finally { await server.dispose(); }
});
