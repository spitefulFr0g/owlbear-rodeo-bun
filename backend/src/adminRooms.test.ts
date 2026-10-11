import { expect, test } from "bun:test";
import { createHash } from "crypto";
import { mkdir, readdir, stat, writeFile } from "fs/promises";
import { join } from "path";
import { createRoom, inviteAccount, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const SLOW = 20000;
const imageHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "image/png",
  "X-Asset-Width": "1", "X-Asset-Height": "1", "X-Asset-Owner": "player" });

async function fileBytes(path: string): Promise<number> {
  const info = await stat(path);
  if (info.isFile()) return info.size;
  return (await Promise.all((await readdir(path)).map(name => fileBytes(join(path, name))))).reduce((a, b) => a + b, 0);
}

test("administrators see every room and actual database and image bytes including unused and shared images", async () => {
  let directory = "";
  const hash = createHash("sha256").update("unused image").digest("hex");
  const server = await startTestServer(async dataDir => {
    directory = dataDir;
    const refs = join(dataDir, "assets", "refs");
    const blobs = join(dataDir, "assets", "blobs", hash.slice(0, 2));
    await mkdir(refs, { recursive: true });
    await mkdir(blobs, { recursive: true });
    await writeFile(join(blobs, hash), "unused image");
    await writeFile(join(refs, "legacy.json"), JSON.stringify({ id: "legacy", hash, size: 12,
      mime: "image/png", width: 1, height: 1, owner: "gm", createdAt: "2025-01-01T00:00:00.000Z" }));
  });
  try {
    const administrator = await setupAdministrator(server);
    const other = await inviteAccount(server, administrator.cookie, "Other", "test-password");
    const first = await createRoom(server, other.cookie, "Alpha");
    const second = await createRoom(server, administrator.cookie, "Beta");
    const uploader = await server.joinRoomAsGM(first.id, other.cookie);
    const reader = await server.joinRoom(second.id);
    for (const id of ["shared", "same-bytes"]) {
      const response = await fetch(`${server.address}/assets/${id}`, { method: "PUT", headers: imageHeaders(uploader.token), body: "12345678" });
      expect(response.status).toBe(201);
      await response.text();
    }
    expect((await fetch(`${server.address}/assets/shared`, { method: "HEAD", headers: imageHeaders(reader.token) })).status).toBe(200);
    const list = async () => {
      const response = await fetch(`${server.address}/api/admin/rooms`, { headers: { Cookie: administrator.cookie } });
      expect(response.status).toBe(200);
      return await response.json() as any;
    };
    const check = async () => {
      const result = await list();
      expect(result.rooms).toEqual([
        { ...first, sizeBytes: 295, gm: { id: other.account.id, username: "Other" } },
        { ...second, sizeBytes: 287, gm: { id: administrator.account.id, username: "Administrator" } },
      ]);
      expect(result.totalBytes).toBe((await stat(join(directory, "owlbear.db"))).size + 20);
      expect(await fileBytes(join(directory, "assets", "blobs"))).toBe(20);
    };
    await check();
    await server.restart();
    await check();
    expect((await fetch(`${server.address}/api/admin/rooms`)).status).toBe(401);
    const forbidden = await fetch(`${server.address}/api/admin/rooms`, { headers: { Cookie: other.cookie } });
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json() as any).error).toBe("not_administrator");
  } finally { await server.dispose(); }
}, SLOW);

test("an administrator deletes another GM's room with notifications, disconnection and exclusive image cleanup", async () => {
  const server = await startTestServer();
  try {
    const administrator = await setupAdministrator(server);
    const other = await inviteAccount(server, administrator.cookie, "Other", "test-password");
    const room = await createRoom(server, other.cookie, "Other room");
    const survivor = await createRoom(server, other.cookie, "Survivor");
    const writer = await server.joinRoomAsGM(room.id, other.cookie);
    const reader = await server.joinRoom(survivor.id);
    for (const id of ["exclusive", "shared"]) {
      const uploaded = await fetch(`${server.address}/assets/${id}`, { method: "PUT", headers: imageHeaders(writer.token), body: id });
      expect(uploaded.status).toBe(201);
      await uploaded.text();
    }
    expect((await fetch(`${server.address}/assets/shared`, { method: "HEAD", headers: imageHeaders(reader.token) })).status).toBe(200);
    const events: string[] = [];
    writer.socket.on("room_deleted", (...args) => { expect(args).toEqual([]); events.push("room_deleted"); });
    const disconnected = nextMessage(writer.socket, "disconnect").then(() => events.push("disconnect"));
    expect((await fetch(`${server.address}/api/rooms/${room.id}`, { method: "DELETE", headers: { Cookie: administrator.cookie } })).status).toBe(204);
    await disconnected;
    expect(events).toEqual(["room_deleted", "disconnect"]);
    expect((await fetch(`${server.address}/assets/exclusive`, { headers: imageHeaders(reader.token) })).status).toBe(404);
    expect((await fetch(`${server.address}/assets/shared`, { headers: imageHeaders(reader.token) })).status).toBe(200);
    expect((await fetch(`${server.address}/assets/shared`, { headers: imageHeaders(writer.token) })).status).toBe(401);
    await server.restart();
    const list = await fetch(`${server.address}/api/admin/rooms`, { headers: { Cookie: administrator.cookie } });
    expect((await list.json() as any).rooms.map((room: any) => room.id)).toEqual([survivor.id]);
    const rename = await fetch(`${server.address}/api/rooms/${survivor.id}`, { method: "PATCH", headers: { Cookie: administrator.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Changed" }) });
    expect(rename.status).toBe(403);
  } finally { await server.dispose(); }
}, SLOW);
