import { tmpdir } from "os";
import { createHash } from "crypto";
import { mkdir, mkdtemp, rm, writeFile, stat } from "fs/promises";
import { join } from "path";
import { expect, test } from "bun:test";
import { uploadLibrary, libraryCommand, createRoom, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test("an unplaced legacy upload is cleared at restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const { token } = await server.joinRoomAsGM(room.id, cookie);
    const asset = await uploadLibrary(server, token, png);
    await libraryCommand((await server.joinRoomAsGM(room.id, cookie)).socket, { action: "delete", id: asset.id });
    await server.restart();
    const rejoined = await server.joinRoom(room.id);
    const downloaded = await fetch(`${server.address}/assets/${asset.files.original.id}`, {
      headers: { Authorization: `Bearer ${rejoined.token}` },
    });
    expect(downloaded.status).toBe(404);
    await downloaded.text();
  } finally { await server.dispose(); }
});

test("two servers keep room passwords, join tokens and images separate", async () => {
  const first = await startTestServer();
  const second = await startTestServer();
  try {
    const firstAccount = await setupAdministrator(first);
    const firstRoom = await createRoom(first, firstAccount.cookie, "Same room", "first-password");
    const secondAccount = await setupAdministrator(second);
    const secondRoom = await createRoom(second, secondAccount.cookie, "Same room", "second-password");
    expect(first.address).not.toBe(second.address);
    const a = await first.joinRoom(firstRoom.id, "first-password");
    const b = await second.joinRoom(secondRoom.id, "second-password");
    const uploader = await first.joinRoomAsGM(firstRoom.id, firstAccount.cookie);
    const asset = await uploadLibrary(first, uploader.token, png);
    const foreign = await fetch(`${second.address}/assets/${asset.files.original.id}`, {
      headers: { Authorization: `Bearer ${a.token}` },
    });
    expect(foreign.status).toBe(401);
    await foreign.text();
    const absent = await fetch(`${second.address}/assets/${asset.files.original.id}`, {
      headers: { Authorization: `Bearer ${b.token}` },
    });
    expect(absent.status).toBe(404);
    await absent.text();
  } finally { await first.dispose(); await second.dispose(); }
});

test("stopping the server disconnects room clients and releases its listener", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const { socket } = await server.joinRoom(room.id);
    const disconnected = new Promise<string>((resolve) => socket.once("disconnect", resolve));
    await server.stop();
    await disconnected;
    expect(socket.connected).toBe(false);
    await expect(fetch(server.address)).rejects.toThrow();
    await server.stop();
  } finally { await server.dispose(); }
});

test("a fresh data directory gets a database", async () => {
  let dataDir = "";
  const server = await startTestServer(async (dir) => { dataDir = dir; });
  try { expect((await stat(join(dataDir, "owlbear.db"))).isFile()).toBe(true); }
  finally { await server.dispose(); }
});

async function legacyAsset(dir: string, id: string, body = png) {
  const hash = createHash("sha256").update(body).digest("hex");
  const blobDir = join(dir, "assets", "blobs", hash.slice(0, 2));
  const refDir = join(dir, "assets", "refs", id.slice(0, 2));
  await mkdir(blobDir, { recursive: true });
  await mkdir(refDir, { recursive: true });
  await writeFile(join(blobDir, hash), body);
  const path = join(refDir, `${id}.json`);
  await writeFile(path, JSON.stringify({ id, hash, size: body.length,
    mime: "image/png", width: 4, height: 2, owner: "old-gm", createdAt: "2025-01-01T00:00:00.000Z" }));
  return path;
}

test("unused v0.1.0 images are cleared and old records are never read again", async () => {
  let dir = "";
  const server = await startTestServer(async (dataDir) => {
    dir = dataDir;
    await legacyAsset(dir, "old-a");
    await legacyAsset(dir, "old-b", new Uint8Array([5, 6, 7]));
  });
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const check = async () => {
      const { token } = await server.joinRoom(room.id);
      for (const [id, body] of [["old-a", png], ["old-b", new Uint8Array([5, 6, 7])]] as const) {
        const response = await fetch(`${server.address}/assets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        expect(response.status).toBe(404);
        expect(response.headers.get("X-Asset-Owner")).toBeNull();
        await response.text();
      }
    };
    await check();
    await expect(stat(join(dir, "assets", "refs"))).rejects.toThrow();
    await server.stop();
    await writeFile(await legacyAsset(dir, "old-a"), "broken record");
    await legacyAsset(dir, "late-record");
    await server.restart();
    await check();
    const { token } = await server.joinRoom((await createRoom(server, cookie, "Third room")).id);
    const late = await fetch(`${server.address}/assets/late-record`, { headers: { Authorization: `Bearer ${token}` } });
    expect(late.status).toBe(404);
    await late.text();
  } finally { await server.dispose(); }
});

test("a failed legacy read-in is retried in full on the next start", async () => {
  const dir = await mkdtemp(join(tmpdir(), "owlbear-legacy-"));
  try {
    await legacyAsset(dir, "aa-first");
    const broken = await legacyAsset(dir, "zz-last");
    await writeFile(broken, "interrupted record");
    await expect(startTestServer(undefined, dir)).rejects.toThrow();
    // The first record must be imported again, rather than left behind
    // by the failed transaction. Its repaired metadata is observable.
    await legacyAsset(dir, "aa-first", new Uint8Array([9, 8]));
    await legacyAsset(dir, "zz-last");
    const server = await startTestServer(undefined, dir);
    try {
      const { cookie } = await setupAdministrator(server);
      const room = await createRoom(server, cookie, "Room");
      const { token } = await server.joinRoom(room.id);
      for (const [id, body] of [["aa-first", new Uint8Array([9, 8])], ["zz-last", png]] as const) {
        const response = await fetch(`${server.address}/assets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        expect(response.status).toBe(404);
        await response.text();
      }
    } finally { await server.dispose(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
