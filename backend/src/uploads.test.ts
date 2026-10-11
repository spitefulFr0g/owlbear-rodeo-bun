import { expect, test } from "bun:test";
import { createRoom, setupAdministrator, startTestServer } from "./testing/serverHelpers";

test("uploads follow the live switch, GM bypasses it, and displays cannot upload", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Uploads");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    const change = (uploads: boolean) => new Promise(resolve => gm.socket.emit("room_switches", { uploads }, resolve));
    const put = (token: string, id: string) => fetch(`${server.address}/assets/${id}`, { method: "PUT", body: new Uint8Array([1]), headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png", "X-Asset-Width": "1", "X-Asset-Height": "1", "X-Asset-Owner": "player" } });
    expect(player.info.room.switches.uploads).toBe(false);
    expect((await put(player.token, "off")).status).toBe(403);
    expect((await put(gm.token, "existing")).status).toBe(201);
    await change(true);
    expect((await put(player.token, "on")).status).toBe(201);
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
