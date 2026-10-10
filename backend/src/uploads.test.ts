import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

test("uploads follow the live switch, GM bypasses it, and refused manifest additions resynchronise", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Uploads");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    const change = (uploads: boolean) => new Promise(resolve => gm.socket.emit("room_switches", { uploads }, resolve));
    const put = (token: string, id: string) => fetch(`${server.address}/assets/${id}`, { method: "PUT", body: new Uint8Array([1]), headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png", "X-Asset-Width": "1", "X-Asset-Height": "1", "X-Asset-Owner": "player" } });
    expect(player.info.room.switches.uploads).toBe(false);
    expect((await put(player.token, "off")).status).toBe(403);
    expect((await put(gm.token, "existing")).status).toBe(201);
    const manifest = { mapId: "map", assets: { existing: { id: "existing", owner: "gm" } } };
    const saved = nextMessage(player.socket, "manifest");
    gm.socket.emit("manifest", manifest);
    await saved;
    let forwarded = 0;
    gm.socket.on("manifest_update", () => forwarded++);
    for (const event of ["manifest", "manifest_update"]) {
      const refused = nextMessage(player.socket, "manifest");
      player.socket.emit(event, event === "manifest" ? { ...manifest, assets: { ...manifest.assets, added: { id: "new", owner: "player" } } } : { id: "map", changes: [{ kind: "E", path: ["assets", "existing", "id"], lhs: "existing", rhs: "new" }] });
      expect((await refused)[0]).toEqual(manifest);
    }
    expect(forwarded).toBe(0);
    const reuse = { id: "map", changes: [{ kind: "N", path: ["assets", "alias"], rhs: { id: "existing", owner: "player" } }] };
    const reused = nextMessage(gm.socket, "manifest_update");
    player.socket.emit("manifest_update", reuse);
    await reused;
    const placed = nextMessage(player.socket, "map_state");
    gm.socket.emit("map_state", { mapId: "map", tokens: {} });
    await placed;
    const tokens = { id: "map", changes: [
      { kind: "N", path: ["tokens", "built-in"], rhs: { type: "default", file: "bear" } },
      { kind: "N", path: ["tokens", "existing"], rhs: { type: "file", file: "existing" } },
    ] };
    const placedByPlayer = nextMessage(gm.socket, "map_state_update");
    player.socket.emit("map_state_update", tokens);
    expect((await placedByPlayer)[0]).toEqual(tokens);
    await change(true);
    expect((await put(player.token, "on")).status).toBe(201);
    const allowed = nextMessage(gm.socket, "manifest_update");
    player.socket.emit("manifest_update", { id: "map", changes: [{ kind: "N", path: ["assets", "added"], rhs: { id: "on", owner: "player" } }] });
    await allowed;
    const link = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, link);
    expect((await put(display.token, "display")).status).toBe(403);
    await change(false);
    expect((await put(player.token, "turned-off")).status).toBe(403);
    expect((await fetch(`${server.address}/assets/existing`, { headers: { Authorization: `Bearer ${player.token}` } })).status).toBe(200);
    await change(true);
    await server.clock.advance(3000);
    const copy = await server.durableCopy();
    try { expect((await copy.joinRoom(room.id)).info.room.switches.uploads).toBe(true); }
    finally { await copy.dispose(); }
    await change(false);
    await server.restart();
    expect((await server.joinRoom(room.id)).info.room.switches.uploads).toBe(false);
  } finally { await server.dispose(); }
}, 15000);
