import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
const action = (socket: Socket, event: string, value: unknown): Promise<{ ok: boolean; error?: string; sceneId?: string }> => new Promise(resolve => socket.emit(event, value, resolve));

test("movement mode defaults on, only the GM changes it, and all viewers receive the saved setting", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene!.id;
    expect(gm.snapshot!.scene!.movementMode).toBe(true);
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const trusted = await server.joinRoom(room.id, "", "trusted");
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const received: unknown[] = [];
    player.socket.on("scene_settings", value => received.push(value));
    for (const peer of [player, trusted, display]) expect(await action(peer.socket, "scene_settings", { sceneId, movementMode: false })).toEqual({ ok: false, error: "not_room_gm" });
    for (const movementMode of [null, 1, "false"]) expect(await action(gm.socket, "scene_settings", { sceneId, movementMode })).toEqual({ ok: false, error: "invalid" });
    const relays = [gm, player, trusted, display].map(peer => nextMessage(peer.socket, "scene_settings"));
    expect(await action(gm.socket, "scene_settings", { sceneId, movementMode: false })).toEqual({ ok: true });
    for (const relay of relays) expect((await relay)[0]).toMatchObject({ sceneId, movementMode: false });
    expect(received).toHaveLength(1);
    const copy = await server.durableCopy();
    try { expect((await copy.joinRoomAsGM(room.id, cookie)).snapshot!.scene!.movementMode).toBe(false); } finally { await copy.dispose(); }
    const duplicate = await action(gm.socket, "scene_duplicate", { sceneId });
    expect(duplicate.ok).toBe(true);
    await server.restart();
    const saved = await server.joinRoomAsGM(room.id, cookie);
    expect(saved.snapshot!.scene!.movementMode).toBe(false);
    const duplicated = nextMessage(saved.socket, "scene_snapshot");
    await action(saved.socket, "scene_view", { sceneId: duplicate.sceneId });
    expect((await duplicated)[0].scene.movementMode).toBe(false);
  } finally { await server.dispose(); }
});
