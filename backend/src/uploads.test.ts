import { expect, test } from "bun:test";
import { uploadLibrary, beginLibrary, createRoom, setupAdministrator, startTestServer } from "./testing/serverHelpers";

test("uploads follow the live switch, GM bypasses it, and displays cannot upload", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Uploads");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id, "", "player");
    const change = (uploads: boolean) => new Promise(resolve => gm.socket.emit("room_switches", { uploads }, resolve));
    const put = (token: string) => beginLibrary(server, token);
    expect(player.info.room.switches.uploads).toBe(false);
    expect((await put(player.token)).status).toBe(400);
    const existing = await uploadLibrary(server, gm.token);
    await change(true);
    expect((await put(player.token)).status).toBe(201);
    const link = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, link);
    expect((await put(display.token)).status).toBe(403);
    await change(false);
    expect((await put(player.token)).status).toBe(400);
    expect((await fetch(`${server.address}/assets/${existing.files.original.id}`, { headers: { Authorization: `Bearer ${player.token}` } })).status).toBe(200);
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
