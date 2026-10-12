import { expect, test } from "bun:test";
import { gunzipSync } from "zlib";
import { join } from "path";
import { signIn, startTestServer } from "./testing/serverHelpers";

const fixture = () => startTestServer(async dir => {
  const bytes = await Bun.file(join(import.meta.dir, "testing/fixtures/scene-documents.db.gz")).arrayBuffer();
  await Bun.write(join(dir, "owlbear.db"), gunzipSync(bytes));
});

test("a version 2 room keeps its items and grid with the new scene defaults after restart", async () => {
  const server = await fixture();
  try {
    const { cookie } = await signIn(server, "Administrator", "test-password");
    const gm = await server.joinRoomAsGM("version-2", cookie);
    const scene = gm.snapshot!.scene!;
    expect(scene).toMatchObject({ id: "old-scene", movementMode: true, fogFill: false, viewOnly: false,
      grid: { type: "hexHorizontal", unitsPerCell: 150, measurement: { type: "euclidean", scale: "10m" }, shown: false, snap: false, opacity: 0.8, lineWidth: 3, color: "#333333" },
      items: { note: { text: "Kept through upgrade", position: { x: 123, y: -456 } } } });
    await new Promise(resolve => gm.socket.emit("room_switches", { tokens: false }, resolve));
    await server.restart();
    expect((await server.joinRoomAsGM("version-2", cookie)).snapshot!.scene).toEqual(scene);
    const { rooms } = await (await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } })).json() as { rooms: { id: string; sizeBytes: number }[] };
    expect(rooms.find(room => room.id === "version-2")!.sizeBytes).toBe(Buffer.byteLength(JSON.stringify({ openSceneId: scene.id, welcomeSceneId: null, scenes: { [scene.id]: { ...scene, name: "Scene 1" } } })));
  } finally { await server.dispose(); }
});

test("every prepared scene and its settings survives a room save and restart", async () => {
  const server = await fixture();
  try {
    const { cookie } = await signIn(server, "Administrator", "test-password");
    const rooms = async () => (await (await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } })).json() as { rooms: { id: string; sizeBytes: number }[] }).rooms;
    const before = (await rooms()).find((room) => room.id === "version-3")!.sizeBytes;
    const gm = await server.joinRoomAsGM("version-3", cookie);
    expect(gm.snapshot!.scene).toMatchObject({ id: "old-scene", movementMode: true, fogFill: true, viewOnly: true, grid: { opacity: 0.3, lineWidth: 4, color: "#123ABC" } });
    await new Promise(resolve => gm.socket.emit("room_switches", { tokens: false }, resolve));
    await server.restart();
    expect((await rooms()).find((room) => room.id === "version-3")!.sizeBytes).toBe(before + 40);
    expect((await server.joinRoomAsGM("version-3", cookie)).snapshot!.scene).toEqual(gm.snapshot!.scene);
  } finally { await server.dispose(); }
});

test("older room documents open as one empty scene and save it as Scene 1", async () => {
  const server = await fixture();
  try {
    const { cookie } = await signIn(server, "Administrator", "test-password");
    const gm = await server.joinRoomAsGM("version-1", cookie);
    expect(gm.snapshot!.scene!.items).toEqual({});
    expect(gm.snapshot!.scene).toMatchObject({ fogFill: false, viewOnly: false, movementMode: true, grid: { type: "square" } });
    await new Promise(resolve => gm.socket.emit("room_switches", { tokens: false }, resolve));
    await server.restart();
    const scene = (await server.joinRoomAsGM("version-1", cookie)).snapshot!.scene!;
    const { rooms } = await (await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } })).json() as { rooms: { id: string; sizeBytes: number }[] };
    expect(rooms.find((room) => room.id === "version-1")!.sizeBytes).toBe(Buffer.byteLength(JSON.stringify({ openSceneId: scene.id, welcomeSceneId: null, scenes: { [scene.id]: { ...scene, name: "Scene 1" } } })));
  } finally { await server.dispose(); }
});

test("no scene snapshot carries its stored name to a GM, player, trusted player or cast display", async () => {
  const server = await fixture();
  try {
    const { cookie } = await signIn(server, "Administrator", "test-password");
    const gm = await server.joinRoomAsGM("version-3", cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom("version-3", "", "player");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const trusted = await server.joinRoom("version-3", "", "trusted");
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay("version-3", token);
    for (const peer of [gm, player, trusted, display]) {
      expect(peer.snapshot!.scene).not.toHaveProperty("name");
      expect(peer.snapshot!.scene!.id).toBe("old-scene");
    }
  } finally { await server.dispose(); }
});

test("the first start on a v0.3.0 layout saves the original database once", async () => {
  let directory = "";
  const original = gunzipSync(await Bun.file(join(import.meta.dir, "testing/fixtures/scene-documents.db.gz")).arrayBuffer());
  const server = await startTestServer(async dir => {
    directory = dir;
    await Bun.write(join(dir, "owlbear.db"), original);
  });
  try {
    expect(Buffer.from(await Bun.file(join(directory, "owlbear.db.before-upgrade")).arrayBuffer())).toEqual(original);
    await server.restart();
    expect(Buffer.from(await Bun.file(join(directory, "owlbear.db.before-upgrade")).arrayBuffer())).toEqual(original);
  } finally { await server.dispose(); }
});
