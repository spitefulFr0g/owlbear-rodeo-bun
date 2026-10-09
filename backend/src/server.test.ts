import { tmpdir } from "os";
import { createHash } from "crypto";
import { mkdir, mkdtemp, rm, writeFile, stat } from "fs/promises";
import { join } from "path";
import { expect, test } from "bun:test";
import { setupAdministrator, startTestServer } from "./testing/serverHelpers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test("an image uploaded with a room connection survives a server restart", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    const { token } = await server.joinRoom("room");
    const uploaded = await fetch(`${server.address}/assets/image`, {
      method: "PUT", body: png,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png",
        "X-Asset-Width": "4", "X-Asset-Height": "2", "X-Asset-Owner": "gm" },
    });
    expect(uploaded.status).toBe(201);
    await uploaded.text();
    await server.restart();
    const rejoined = await server.joinRoom("room");
    const downloaded = await fetch(`${server.address}/assets/image`, {
      headers: { Authorization: `Bearer ${rejoined.token}` },
    });
    expect(downloaded.status).toBe(200);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(png);
  } finally { await server.dispose(); }
});

test("two servers keep room passwords, join tokens and images separate", async () => {
  const first = await startTestServer();
  const second = await startTestServer();
  try {
    await setupAdministrator(first);
    await setupAdministrator(second);
    expect(first.address).not.toBe(second.address);
    const a = await first.joinRoom("same-room", "first-password");
    const b = await second.joinRoom("same-room", "second-password");
    const response = await fetch(`${first.address}/assets/separate`, {
      method: "PUT", body: png,
      headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "image/png",
        "X-Asset-Width": "4", "X-Asset-Height": "2", "X-Asset-Owner": "gm" },
    });
    expect(response.status).toBe(201);
    await response.text();
    const foreign = await fetch(`${second.address}/assets/separate`, {
      headers: { Authorization: `Bearer ${a.token}` },
    });
    expect(foreign.status).toBe(401);
    await foreign.text();
    const absent = await fetch(`${second.address}/assets/separate`, {
      headers: { Authorization: `Bearer ${b.token}` },
    });
    expect(absent.status).toBe(404);
    await absent.text();
  } finally { await first.dispose(); await second.dispose(); }
});

test("stopping the server disconnects room clients and releases its listener", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    const { socket } = await server.joinRoom("room");
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

test("every v0.1.0 image remains downloadable and old records are never read again", async () => {
  let dir = "";
  const server = await startTestServer(async (dataDir) => {
    dir = dataDir;
    await legacyAsset(dir, "old-a");
    await legacyAsset(dir, "old-b", new Uint8Array([5, 6, 7]));
  });
  try {
    await setupAdministrator(server);
    const check = async () => {
      const { token } = await server.joinRoom("another-room");
      for (const [id, body] of [["old-a", png], ["old-b", new Uint8Array([5, 6, 7])]] as const) {
        const response = await fetch(`${server.address}/assets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        expect(response.status).toBe(200);
        expect(response.headers.get("X-Asset-Owner")).toBe("old-gm");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
      }
    };
    await check();
    await expect(stat(join(dir, "assets", "refs"))).rejects.toThrow();
    await server.stop();
    await writeFile(await legacyAsset(dir, "old-a"), "broken record");
    await legacyAsset(dir, "late-record");
    await server.restart();
    await check();
    const { token } = await server.joinRoom("third-room");
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
      await setupAdministrator(server);
      const { token } = await server.joinRoom("room");
      for (const [id, body] of [["aa-first", new Uint8Array([9, 8])], ["zz-last", png]] as const) {
        const response = await fetch(`${server.address}/assets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        expect(response.status).toBe(200);
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
      }
    } finally { await server.dispose(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
