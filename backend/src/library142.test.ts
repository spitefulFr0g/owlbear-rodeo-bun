import { expect, test } from "bun:test";
import { beginLibrary, createRoom, inviteAccount, libraryCommand, libraryMetadata, nextMessage, setupAdministrator, startTestServer, uploadLibrary, sendBatch } from "./testing/serverHelpers";
import { tokenItem } from "./testing/sceneFixtures";
import { randomUUID } from "crypto";
import { join } from "path";
import { OwlbearDatabase } from "./database";
import type { LibraryReservation } from "../../src/sceneRules/library";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
async function fixture() {
  const server = await startTestServer();
  const admin = await setupAdministrator(server);
  const room = await createRoom(server, admin.cookie, "Library");
  const gm = await server.joinRoomAsGM(room.id, admin.cookie);
  await new Promise(resolve => gm.socket.emit("session", true, resolve));
  const player = await server.joinRoom(room.id, "", "player");
  const other = await server.joinRoom(room.id, "", "other");
  const change = (uploads: boolean) => new Promise(resolve => gm.socket.emit("room_switches", { uploads }, resolve));
  const quota = (kind: "rooms" | "accounts", id: string, bytes: number) => fetch(`${server.address}/api/admin/${kind}/${id}/quota`, { method: "PATCH", headers: { Cookie: admin.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ bytes }) });
  const put = (r: LibraryReservation, token: string, bytes: string, role = "original") => fetch(`${server.address}/api/library/${r.assetId}/files/${role}`, { method: "PUT", headers: auth(token), body: bytes });
  const complete = (r: LibraryReservation, token = gm.token) => fetch(`${server.address}/api/library/${r.assetId}/complete`, { method: "POST", headers: auth(token) });
  // A full library still takes one original to recognise a duplicate, so its refusal can arrive at the upload.
  const refusal = async (token: string, fields: Record<string, unknown> = {}) => {
    const begin = await beginLibrary(server, token, fields); const answer = await begin.json() as any;
    if (begin.status !== 201) return answer.error;
    const upload = await put(answer, token, "z".repeat(answer.files.original.size));
    return upload.status === 201 ? undefined : (await upload.json() as any).error;
  };
  return { server, admin, room, gm, player, other, change, quota, put, complete, refusal };
}

test("reserved uploads bind files to connection and role, publish only complete entries, deduplicate within visibility and survive restart", async () => {
  const f = await fixture(); const { server, gm, player, room, admin } = f;
  try {
    const deltas: any[] = []; gm.socket.on("library_delta", d => deltas.push(d));
    const begin = await beginLibrary(server, gm.token, { files: { original: { size: 5, mime: "image/png" }, thumbnail: { size: 2, mime: "image/png" } } });
    expect(begin.status).toBe(201); const r = await begin.json() as LibraryReservation;
    expect((await f.put(r, player.token, "image")).status).toBe(400);
    expect((await f.put(r, gm.token, "no", "low")).status).toBe(400); // Invalid roles release the reservation.
    const next = await (await beginLibrary(server, gm.token, { files: { original: { size: 5, mime: "image/png" }, thumbnail: { size: 2, mime: "image/png" } } })).json() as LibraryReservation;
    expect((await f.put(next, gm.token, "image")).status).toBe(201);
    expect((await f.complete(next)).status).toBe(400);
    expect(deltas.flatMap(d => d.assets.added)).toEqual([]);
    expect((await f.put(next, gm.token, "tn", "thumbnail")).status).toBe(201);
    expect((await f.complete(next)).status).toBe(200);
    const duplicate = await uploadLibrary(server, gm.token);
    expect(duplicate.id).toBe(next.assetId);
    expect(duplicate.files.original.id).toBe(next.files.original.id);
    await f.change(true);
    const own = await uploadLibrary(server, player.token);
    expect(own.id).not.toBe(duplicate.id);
    const account = await uploadLibrary(server, gm.token, "image", { import: true });
    expect(account.id).not.toBe(duplicate.id);
    expect(account.library).toEqual({ kind: "account", id: admin.account.id });
    expect((await beginLibrary(server, player.token, { import: true })).status).toBe(400);
    await server.restart();
    const socket = server.connect(admin.cookie); const snapshot = nextMessage(socket, "library_snapshot"); socket.emit("join_game", room.id, "");
    expect((await snapshot)[0].assets.map((a: any) => a.id).sort()).toEqual([own.id, account.id, duplicate.id].sort());
  } finally { await server.dispose(); }
});

test("quota equality succeeds, a byte over and concurrent reservations refuse, lowered quotas preserve assets and cleanup frees reservations", async () => {
  const f = await fixture(); const { server, gm, room, player, other } = f;
  try {
    await f.change(true);
    expect((await f.quota("rooms", room.id, 10)).status).toBe(200);
    expect(await libraryCommand(gm.socket, { action: "player-quota", bytes: 5 })).toEqual({ ok: true });
    const responses = await Promise.all([beginLibrary(server, player.token), beginLibrary(server, player.token), beginLibrary(server, player.token)]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 201, 400]); // The second only looks for a duplicate.
    for (const response of responses.filter(r => r.status === 201)) expect((await f.put(await response.json() as LibraryReservation, player.token, "longer")).status).toBe(400);
    const own = await uploadLibrary(server, player.token);
    expect(await f.refusal(player.token, { files: { original: { size: 1, mime: "image/png" } } })).toBe("Player quota exceeded");
    await uploadLibrary(server, other.token, "other");
    const fresh = await server.joinRoom(room.id, "", "new-browser");
    expect(await f.refusal(fresh.token, { files: { original: { size: 1, mime: "image/png" } } })).toBe("Room quota exceeded");
    await f.quota("rooms", room.id, 1);
    expect(await f.refusal(gm.token)).toBe("Room quota exceeded");
    expect(await libraryCommand(player.socket, { action: "delete", id: own.id })).toEqual({ ok: true });
    await f.quota("rooms", room.id, 10);
    const held = await (await beginLibrary(server, gm.token)).json() as LibraryReservation;
    await server.clock.advance(15 * 60 * 1000);
    expect((await f.put(held, gm.token, "image")).status).toBe(400);
    expect((await beginLibrary(server, gm.token)).status).toBe(201);
  } finally { await server.dispose(); }
});

test("switches, trusted status, cast, metadata and folder ownership are enforced on the server", async () => {
  const f = await fixture(); const { server, gm, player, other, room } = f;
  try {
    expect((await beginLibrary(server, player.token)).status).toBe(400);
    expect((await beginLibrary(server, gm.token)).status).toBe(201);
    await new Promise(resolve => gm.socket.emit("room_trust", "player", true, resolve));
    expect((await beginLibrary(server, player.token)).status).toBe(201);
    expect((await beginLibrary(server, player.token, { type: "map" })).status).toBe(400);
    const folder = await libraryCommand(player.socket, { action: "folder-create", library: "room", name: " Own " });
    expect(folder.ok).toBe(true);
    expect((await libraryCommand(other.socket, { action: "folder-delete", id: folder.id })).ok).toBe(false);
    expect((await beginLibrary(server, gm.token, { folderId: folder.id })).status).toBe(400);
    const own = await uploadLibrary(server, player.token, "own", { folderId: folder.id });
    for (const value of [{ action: "edit", id: own.id, changes: { type: "map" } }, { action: "move", id: own.id, destination: "account" }, { action: "edit", id: own.id, changes: { files: {} } }]) expect((await libraryCommand(player.socket, value)).ok).toBe(false);
    const gmAsset = await uploadLibrary(server, gm.token, "gm");
    for (const id of [gmAsset.id, own.id, "bundled"]) expect((await libraryCommand(other.socket, { action: "delete", id })).ok).toBe(false);
    expect((await libraryCommand(player.socket, { action: "folder-delete", id: folder.id })).ok).toBe(true);
    const link = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, link);
    expect((await beginLibrary(server, display.token)).status).toBe(403);
    expect((await libraryCommand(display.socket, { action: "delete", id: own.id })).ok).toBe(false);
    expect((await fetch(`${server.address}/assets/arbitrary`, { method: "PUT", headers: auth(gm.token), body: "bypass" })).status).toBe(403);
    for (const fields of [{ name: " " }, { name: "a".repeat(101) }, { width: -1 }, { defaults: {} }, { files: { original: { size: 67108865, mime: "image/png" } } }, { files: { original: { size: 1, mime: "text/html" } } }]) expect((await beginLibrary(server, gm.token, fields)).status).toBe(400);
  } finally { await server.dispose(); }
});

test("moves remove player entries, free player quota, fan account changes across rooms and refuse duplicates and destination quotas", async () => {
  const f = await fixture(); const { server, admin, gm, player, room } = f;
  try {
    await f.change(true);
    const second = await createRoom(server, admin.cookie, "Second"); const secondGM = await server.joinRoomAsGM(second.id, admin.cookie);
    const own = await uploadLibrary(server, player.token);
    await libraryCommand(gm.socket, { action: "player-quota", bytes: 5 });
    await libraryCommand(player.socket, { action: "edit", id: own.id, changes: { name: own.name } });
    await libraryCommand(secondGM.socket, { action: "player-quota", bytes: 100000000 });
    const removed = nextMessage(player.socket, "library_delta"); const accountDelta = nextMessage(secondGM.socket, "library_delta");
    expect((await libraryCommand(gm.socket, { action: "move", id: own.id, destination: "account" })).ok).toBe(true);
    expect((await removed)[0].assets.removed).toEqual([own.id]);
    expect((await accountDelta)[0].assets.added[0]).toMatchObject({ id: own.id, uploader: null, folderId: null });
    const secondOwn = await uploadLibrary(server, player.token);
    expect((await libraryCommand(gm.socket, { action: "move", id: own.id, destination: "room" })).ok).toBe(false);
    await f.quota("accounts", admin.account.id, 5);
    const another = await uploadLibrary(server, gm.token, "other");
    expect((await libraryCommand(gm.socket, { action: "move", id: another.id, destination: "account" })).error).toBe("Account quota exceeded");
    expect(await f.refusal(gm.token, { import: true })).toBe("Account quota exceeded");
    await f.quota("accounts", admin.account.id, 0);
    expect(await f.refusal(gm.token, { import: true })).toBe("Account quota exceeded");
    await libraryCommand(player.socket, { action: "delete", id: secondOwn.id });
    await f.quota("rooms", room.id, 100);
    expect((await libraryCommand(gm.socket, { action: "move", id: own.id, destination: "room" })).ok).toBe(true);
  } finally { await server.dispose(); }
});

test("downloads grant no placement, own and placed files remain placeable with uploads off, deletion frees quota and restart cleans unused files", async () => {
  const f = await fixture(); const { server, gm, player, other, room, admin } = f;
  try {
    await f.change(true);
    const own = await uploadLibrary(server, player.token); const hidden = await uploadLibrary(server, other.token, "other"); const gmAsset = await uploadLibrary(server, gm.token, "GM");
    const add = (id: string, file: string, peer = player) => sendBatch(peer.socket, { id, sceneId: gm.snapshot!.scene!.id, changes: [{ type: "add", item: { ...tokenItem, id, owner: "player", image: { type: "file", file } } }] });
    for (const uploads of [false, true]) {
      await f.change(uploads);
      for (const asset of [hidden, gmAsset]) {
        expect((await fetch(`${server.address}/assets/${asset.files.original.id}`, { headers: auth(player.token) })).status).toBe(200);
        expect((await add(`refused-${asset.id}-${uploads}`, asset.files.original.id)).refused).toHaveLength(1);
      }
      expect((await add(`own-${uploads}`, own.files.original.id)).refused).toEqual([]);
    }
    expect((await add("gm-placed", gmAsset.files.original.id, gm)).refused).toEqual([]);
    expect((await add("copy", gmAsset.files.original.id)).refused).toEqual([]);
    await libraryCommand(player.socket, { action: "delete", id: own.id });
    expect((await add("undo", own.files.original.id)).refused).toEqual([]);
    await libraryCommand(other.socket, { action: "delete", id: hidden.id });
    expect((await fetch(`${server.address}/assets/${hidden.files.original.id}`, { headers: auth(gm.token) })).status).toBe(200);
    const incomplete = await (await beginLibrary(server, gm.token)).json() as LibraryReservation;
    await f.put(incomplete, gm.token, "image");
    await server.restart();
    const joined = await server.joinRoomAsGM(room.id, admin.cookie);
    for (const [id, status] of [[hidden.files.original.id, 404], [incomplete.files.original.id, 404], [own.files.original.id, 200], [gmAsset.files.original.id, 200]] as const) expect((await fetch(`${server.address}/assets/${id}`, { headers: auth(joined.token) })).status).toBe(status);
  } finally { await server.dispose(); }
});

test("removing an account transfers its library and merges folders by name", async () => {
  const f = await fixture(); const { server, admin, gm } = f;
  try {
    const other = await inviteAccount(server, admin.cookie, "OtherGM", "password");
    const room = await createRoom(server, other.cookie, "Other"); const peer = await server.joinRoomAsGM(room.id, other.cookie);
    const folder = await libraryCommand(peer.socket, { action: "folder-create", library: "account", name: "Maps" });
    const target = await libraryCommand(gm.socket, { action: "folder-create", library: "account", name: "Maps" });
    const asset = await uploadLibrary(server, peer.token, "transferred", { import: true, folderId: folder.id });
    const delta = nextMessage(gm.socket, "library_delta");
    expect((await fetch(`${server.address}/api/admin/accounts/${other.account.id}`, { method: "DELETE", headers: { Cookie: admin.cookie } })).status).toBe(204);
    expect((await delta)[0].assets.added[0]).toMatchObject({ id: asset.id, folderId: target.id, library: { kind: "account", id: admin.account.id } });
  } finally { await server.dispose(); }
});

test("join snapshots redact assets and folders, persist edits and quotas, and expose account sizes to the owner and quotas to administrators", async () => {
  const f = await fixture(); const { server, admin, gm, player, other, room } = f;
  try {
    await f.change(true);
    const folder = await libraryCommand(player.socket, { action: "folder-create", library: "room", name: "Player folder" });
    const own = await uploadLibrary(server, player.token, "own", { folderId: folder.id });
    const hidden = await uploadLibrary(server, other.token, "hidden");
    const account = await uploadLibrary(server, gm.token, "account", { import: true });
    await libraryCommand(player.socket, { action: "edit", id: own.id, changes: { name: " Renamed ", type: "mount" } });
    await libraryCommand(gm.socket, { action: "player-quota", bytes: 100 });
    await f.quota("rooms", room.id, 200);
    await f.quota("accounts", admin.account.id, 300);
    await server.restart();
    const view = async (cookie?: string, playerId?: string) => {
      const socket = server.connect(cookie); const snapshot = nextMessage(socket, "library_snapshot"); socket.emit("join_game", room.id, "", undefined, { playerId }); return (await snapshot)[0];
    };
    const anonymous = await view();
    expect(anonymous.assets).toEqual([]); expect(anonymous.folders).toEqual([]); expect(anonymous.usage.player).toMatchObject({ bytes: 0, reservedBytes: 0 });
    const personal = await view(undefined, "player");
    expect(personal.assets.map((a: any) => a.id)).toEqual([own.id]); expect(personal.assets[0].type).toBe("mount");
    expect(personal.assets[0].name).toBe("Renamed");
    expect(personal.folders.map((f: any) => f.id)).toEqual([folder.id]); expect(personal.usage.player).toMatchObject({ bytes: 3, quota: 100 });
    expect(personal.usage.room).toBeUndefined();
    const full = await view(admin.cookie);
    expect(full.folders).toEqual([]);
    expect(full.assets.map((a: any) => a.id).sort()).toEqual([own.id, hidden.id, account.id].sort());
    expect(full.usage.room).toMatchObject({ bytes: 9, quota: 200 }); expect(full.usage.account).toMatchObject({ bytes: 7, quota: 300 });
    const list = await (await fetch(`${server.address}/api/rooms`, { headers: { Cookie: admin.cookie } })).json() as any;
    expect(list.accountLibrary).toEqual({ sizeBytes: 7, quota: 300 }); expect(list.rooms[0].sizeBytes).toBe(414);
    const quotas = await (await fetch(`${server.address}/api/admin/library-quotas`, { headers: { Cookie: admin.cookie } })).json() as any;
    expect(quotas.accounts[0]).toMatchObject({ id: admin.account.id, quota: 300, sizeBytes: 7 });
    expect(quotas.rooms[0]).toMatchObject({ id: room.id, quota: 200, playerQuota: 100 });
    expect((await fetch(`${server.address}/api/admin/library-quotas`)).status).toBe(401);
  } finally { await server.dispose(); }
});

test("original-first uploads enforce declared lengths, global file cap and immutable role ids, and discard failed reservations", async () => {
  const f = await fixture(); const { server, gm } = f;
  try {
    const begin = async (size = 5) => (await (await beginLibrary(server, gm.token, { files: { original: { size, mime: "application/octet-stream" }, thumbnail: { size: 1, mime: "image/png" } } })).json()) as LibraryReservation;
    const early = await begin(); expect((await f.put(early, gm.token, "t", "thumbnail")).status).toBe(400);
    const short = await begin(); expect((await f.put(short, gm.token, "tiny")).status).toBe(400);
    const large = await begin();
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("12345")); c.enqueue(new TextEncoder().encode("6")); c.close(); } });
    expect((await fetch(`${server.address}/api/library/${large.assetId}/files/original`, { method: "PUT", headers: auth(gm.token), body })).status).toBe(400);
    const valid = await begin(); expect((await f.put(valid, gm.token, "image")).status).toBe(201);
    expect((await f.put(valid, gm.token, "other")).status).toBe(400);
    expect((await fetch(`${server.address}/assets/${valid.files.original.id}`, { headers: auth(gm.token) })).status).toBe(404);
    const atCap = await (await beginLibrary(server, gm.token, { files: { original: { size: 67108864, mime: "image/png" } } })).json() as LibraryReservation;
    expect((await fetch(`${server.address}/api/library/${atCap.assetId}/files/original`, { method: "PUT", headers: auth(gm.token), body: new Uint8Array(67108864) })).status).toBe(201);
    expect((await f.complete(atCap)).status).toBe(200);
    expect((await beginLibrary(server, gm.token, { files: { original: { size: 67108865, mime: "image/png" } } })).status).toBe(400);
  } finally { await server.dispose(); }
});

test("derived bytes count at equality, lowered player quotas preserve entries, and account reservations enforce equality and one byte over", async () => {
  const f = await fixture(); const { server, gm, player, admin, room } = f;
  try {
    await f.change(true);
    await f.quota("rooms", room.id, 7);
    await libraryCommand(gm.socket, { action: "player-quota", bytes: 7 });
    const response = await beginLibrary(server, player.token, { uploader: null, library: { kind: "account", id: admin.account.id }, files: { original: { size: 5, mime: "image/png" }, thumbnail: { size: 2, mime: "image/png" } } });
    expect(response.status).toBe(201); const r = await response.json() as LibraryReservation;
    await f.put(r, player.token, "image"); await f.put(r, player.token, "tn", "thumbnail");
    const complete = await f.complete(r, player.token); const asset = (await complete.json() as any).asset;
    expect(asset.library).toEqual({ kind: "room", id: room.id }); expect(asset.uploader).toBe("player");
    await libraryCommand(gm.socket, { action: "player-quota", bytes: 1 });
    expect(await f.refusal(player.token, { files: { original: { size: 1, mime: "image/png" } } })).toBe("Room quota exceeded");
    expect((await libraryCommand(gm.socket, { action: "move", id: asset.id, destination: "room" })).ok).toBe(true);
    await f.quota("rooms", room.id, 8);
    expect((await beginLibrary(server, player.token, { files: { original: { size: 1, mime: "image/png" } } })).status).toBe(201);
    await f.quota("accounts", admin.account.id, 5);
    const account = await uploadLibrary(server, gm.token, "12345", { import: true });
    expect(await f.refusal(gm.token, { import: true, files: { original: { size: 1, mime: "image/png" } } })).toBe("Account quota exceeded");
    expect((await libraryCommand(gm.socket, { action: "delete", id: account.id })).ok).toBe(true);
    expect((await beginLibrary(server, gm.token, { import: true })).status).toBe(201);
    for (const command of [{ action: "player-quota", bytes: 0 }, { action: "folder-create", library: "account", name: "Hidden" }, { action: "edit", id: asset.id, changes: { name: "Forbidden" } }, { action: "move", id: asset.id, destination: "account" }]) expect((await libraryCommand(player.socket, command)).ok).toBe(false);
  } finally { await server.dispose(); }
});

test("simultaneous original uploads publish one entry and discard the duplicate's stored ids", async () => {
  const f = await fixture(); const { server, gm } = f;
  try {
    const first = await (await beginLibrary(server, gm.token)).json() as LibraryReservation;
    const second = await (await beginLibrary(server, gm.token)).json() as LibraryReservation;
    expect((await f.put(first, gm.token, "image")).status).toBe(201);
    expect((await f.put(second, gm.token, "image")).status).toBe(201);
    const completions = await Promise.all([f.complete(first), f.complete(second)]);
    const records = await Promise.all(completions.map(async response => (await response.json() as any).asset));
    expect(records[0].id).toBe(records[1].id);
    await libraryCommand(gm.socket, { action: "edit", id: records[0].id, changes: { name: "Published once" } });
    const unused = records[0].id === first.assetId ? second.files.original.id : first.files.original.id;
    // A subsequent request observes queued physical cleanup, without reading storage internals.
    expect((await fetch(`${server.address}/assets/${unused}`, { headers: auth(gm.token) })).status).toBe(404);
    expect((await fetch(`${server.address}/assets/${records[0].files.original.id}`, { headers: auth(gm.token) })).status).toBe(200);
  } finally { await server.dispose(); }
});

// Each cap test uses the public interface; no fixture writes database records.
test("the fixed folder cap counts every player's folders", async () => {
  const f = await fixture(); const { server, gm, player } = f;
  try {
    for (let i = 0; i < 1000; i++) {
      const created = await libraryCommand(i % 2 ? player.socket : gm.socket, { action: "folder-create", library: "room", name: `Folder ${i}` });
      expect(created.ok).toBe(true);
    }
    expect((await libraryCommand(gm.socket, { action: "folder-create", library: "room", name: "One too many" })).error).toBe("Library folder count limit reached");
  } finally { await server.dispose(); }
}, 600000);

test("the fixed asset cap counts incomplete uploads", async () => {
  const f = await fixture(); const { server, admin, room } = f;
  try {
    // Ten thousand begin requests take half a minute on CI, so unlike other tests this one writes
    // most of the cap as held assets into the stopped server's data, then reserves the rest.
    const reserved = 100;
    await server.restart({}, dataDir => {
      const database = new OwlbearDatabase(join(dataDir, "owlbear.db"));
      try {
        database.transaction(() => {
          for (let i = 0; i < 10000 - reserved; i++) database.library.saveAsset({ ...libraryMetadata, id: randomUUID(), library: { kind: "room", id: room.id },
            files: { original: { id: randomUUID(), size: 1 } }, folderId: null, uploader: null, created: 0, uploading: false });
        });
      } finally { database.close(); }
    });
    const gm = await server.joinRoomAsGM(room.id, admin.cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const files = { original: { size: 1, mime: "image/png" } };
    for (let i = 0; i < reserved; i++) {
      const response = await beginLibrary(server, gm.token, { files });
      if (response.status !== 201) throw new Error(`Reservation ${i}: ${await response.text()}`);
    }
    expect(await f.refusal(gm.token, { files })).toBe("Library asset count limit reached");
  } finally { await server.dispose(); }
});

test("a full library still recognises a duplicate, holding one over-limit reservation at a time per library", async () => {
  const f = await fixture(); const { server, gm, player, admin, room } = f;
  try {
    await f.change(true);
    await f.quota("accounts", admin.account.id, 5);
    const imported = await uploadLibrary(server, gm.token, "image", { import: true });
    expect((await uploadLibrary(server, gm.token, "image", { import: true })).id).toBe(imported.id);
    await libraryCommand(gm.socket, { action: "player-quota", bytes: 3 });
    const own = await uploadLibrary(server, player.token, "own");
    expect((await uploadLibrary(server, player.token, "own")).id).toBe(own.id);
    const held = await beginLibrary(server, gm.token, { import: true });
    expect(held.status).toBe(201);
    expect(await f.refusal(gm.token, { import: true })).toBe("Account quota exceeded");
    expect(await f.refusal(player.token)).toBe("Player quota exceeded");
    const reservation = await held.json() as LibraryReservation;
    expect((await f.put(reservation, gm.token, "other")).status).toBe(400);
    expect((await f.complete(reservation)).status).toBe(400);
    expect((await uploadLibrary(server, gm.token, "image", { import: true })).id).toBe(imported.id);
    await f.quota("rooms", room.id, 1);
    expect((await uploadLibrary(server, player.token, "own")).id).toBe(own.id);
    // The hold is per library, so another player identity cannot take a second one.
    expect((await beginLibrary(server, player.token)).status).toBe(201);
    const rejoined = await server.joinRoom(room.id, "", "renamed");
    const second = await beginLibrary(server, rejoined.token);
    expect(second.status).toBe(400);
    expect((await second.json() as any).error).toBe("Room quota exceeded");
    expect(await f.refusal(gm.token)).toBe("Room quota exceeded");
  } finally { await server.dispose(); }
});

test("growing incomplete image metadata does not delay reservations or placement or publish incomplete assets", async () => {
  const f = await fixture(); const { server, gm } = f;
  try {
    const asset = await uploadLibrary(server, gm.token, "placed image");
    await libraryCommand(gm.socket, { action: "edit", id: asset.id, changes: { name: "Placed image" } });
    const outline = { type: "path", points: Array.from({ length: 20000 }, (_, i) => i % 100) };
    const deltas: any[] = [];
    gm.socket.on("library_delta", delta => deltas.push(delta));
    for (let i = 0; i < 512; i++) {
      const response = await beginLibrary(server, gm.token, { outline, files: { original: { size: 1, mime: "image/png" } } });
      expect(response.status).toBe(201);
    }
    // Await the socket event rather than assuming HTTP and socket delivery order.
    while (deltas.at(-1)?.usage.room.reservedBytes !== 512) await nextMessage(gm.socket, "library_delta");
    expect(deltas.at(-1).usage.room).toMatchObject({ bytes: 12, reservedBytes: 512 });
    expect(deltas.every(delta => Object.values(delta.assets).every((records: any) => records.length === 0))).toBe(true);
    const sceneId = gm.snapshot?.scene?.id;
    if (!sceneId) throw new Error("The GM must have a scene before placing images");
    const changes = Array.from({ length: 64 }, (_, i) => ({ type: "add" as const,
      item: { ...tokenItem, id: `during-upload-${i}`, image: { type: "file" as const, file: asset.files.original.id } } }));
    const answer = await sendBatch(gm.socket, { id: "during-upload", sceneId, changes });
    expect(answer.refused).toEqual([]);
    expect(answer.applied).toHaveLength(64);
  } finally { await server.dispose(); }
}, 10000);
