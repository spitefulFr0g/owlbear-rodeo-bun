import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const view = { x: -150, y: 300, width: 900, height: 600 };
const action = (socket: Socket, event: string, value: unknown): Promise<any> =>
  new Promise((resolve, reject) => socket.timeout(2000).emit(event, value, (error: Error | null, result: unknown) => error ? reject(error) : resolve(result)));

test("Bring players here reaches every player once without moving GMs or cast displays or retaining the view", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const otherGM = await server.joinRoomAsGM(room.id, cookie);
    await action(gm.socket, "session", true);
    const players = [await server.joinRoom(room.id, "", "player"), await server.joinRoom(room.id, "", "trusted")];
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const excluded: unknown[] = [];
    for (const peer of [gm, otherGM, display, ...players]) peer.socket.onAny((event, value) => {
      if (["scene_snapshot", "scene_list", "display_view", "scene_changes", "scene_answer"].includes(event) ||
        (event === "player_view" && !players.includes(peer))) excluded.push([event, value]);
    });
    const messages = players.map(peer => nextMessage(peer.socket, "player_view"));
    expect(await action(gm.socket, "scene_bring", { view })).toEqual({ ok: true });
    for (const message of await Promise.all(messages)) expect(message[0]).toEqual({ sceneId: gm.snapshot!.scene!.id, ...view });
    const joined = await server.joinDisplay(room.id, token);
    const retained: unknown[] = [];
    joined.socket.on("display_view", value => retained.push(value));
    gm.socket.emit("display_freeze", false);
    await action(gm.socket, "scene_view", { sceneId: gm.snapshot!.scene!.id });
    expect(retained).toEqual([]);
    // The explicit scene_view above is the only snapshot, sent to its GM.
    expect(excluded).toHaveLength(1);
    expect((excluded[0] as unknown[])[0]).toBe("scene_snapshot");
  } finally { await server.dispose(); }
});

test("Bring players here refuses non-GMs, malformed views, no session and a GM preparing another scene without sending anything", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const openSceneId = gm.snapshot!.scene!.id;
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    expect(await action(gm.socket, "scene_bring", { view })).toEqual({ ok: false, error: "no_session" });
    await action(gm.socket, "session", true);
    const received: unknown[] = [];
    for (const peer of [player, trusted, display]) peer.socket.onAny((event, value) => {
      if (["scene_snapshot", "player_view", "display_view", "scene_list", "scene_changes", "scene_answer"].includes(event)) received.push([event, value]);
    });
    for (const peer of [player, trusted, display]) {
      expect(await action(peer.socket, "scene_bring", { view })).toEqual({ ok: false, error: "not_room_gm" });
    }
    for (const payload of [null, [], true, {}, { view, extra: true }, { view: [] }, { view: {} },
      { view: { ...view, x: "1" } }, { view: { ...view, x: Infinity } },
      { view: { ...view, width: 0 } }, { view: { ...view, height: -1 } },
      { view: { ...view, sceneId: openSceneId } }]) {
      expect(await action(gm.socket, "scene_bring", payload)).toEqual({ ok: false, error: "invalid" });
    }
    await action(gm.socket, "scene_create", { name: "Preparation" });
    expect(await action(gm.socket, "scene_bring", { view })).toEqual({ ok: false, error: "not_open_scene" });
    await action(gm.socket, "scene_view", { sceneId: openSceneId });
    expect(received).toEqual([]);
  } finally { await server.dispose(); }
});
