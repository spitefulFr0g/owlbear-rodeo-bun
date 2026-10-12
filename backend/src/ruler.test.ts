import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { ReceivedLiveMessage } from "../../src/sceneRules";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const action = (socket: Socket, event: string, value: unknown) => new Promise<{ ok: boolean; sceneId: string }>(resolve => socket.emit(event, value, resolve));
const barrier = (socket: Socket) => new Promise(resolve => socket.emit("get_display_token", resolve));
const ruler = (sceneId: string, x = 1) => ({ sceneId, kind: "ruler" as const, state: { start: { x, y: 2 }, end: { x: 3, y: 4 } } });

for (const viewOnly of [false, true]) test(`a player's ruler reaches other viewers and a frozen cast display on ${viewOnly ? "a view-only" : "the open"} scene`, async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server), room = await createRoom(server, cookie, "Rulers");
    const gm = await server.joinRoomAsGM(room.id, cookie), sceneId = (gm.snapshot?.scene?.id ?? "");
    await action(gm.socket, "session", true);
    await action(gm.socket, "scene_settings", { sceneId, viewOnly });
    const player = await server.joinRoom(room.id, "", "player"), other = await server.joinRoom(room.id, "", "other");
    const display = await server.joinDisplay(room.id, await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve)));
    gm.socket.emit("display_freeze", true); await barrier(gm.socket);
    const peers = [gm, other, display], own: unknown[] = [];
    player.socket.on("live", value => own.push(value));
    const messages = peers.map(peer => nextMessage(peer.socket, "live"));
    player.socket.emit("live", { ...ruler(sceneId), connectionId: "forged", state: { ...ruler(sceneId).state, distance: 99, color: "red" } });
    for (const message of await Promise.all(messages)) expect(message[0]).toEqual({ ...ruler(sceneId), connectionId: (player.socket.id ?? "") });
    const received: unknown[] = []; gm.socket.on("live", value => received.push(value));
    display.socket.emit("live", ruler(sceneId)); await barrier(display.socket);
    for (const packet of [{ ...ruler(sceneId), state: {} }, { ...ruler(sceneId), state: { start: null, end: { x: 1, y: 2 } } }, ruler("wrong")]) player.socket.emit("live", packet);
    const sentinels = peers.map(peer => nextMessage(peer.socket, "live")); player.socket.emit("live", ruler(sceneId, 9)); await Promise.all(sentinels);
    expect(received).toEqual([{ ...ruler(sceneId, 9), connectionId: (player.socket.id ?? "") }]);
    const ends = peers.map(peer => nextMessage(peer.socket, "live"));
    player.socket.emit("live", { sceneId, kind: "ruler", state: null });
    for (const message of await Promise.all(ends)) expect(message[0]).toEqual({ sceneId, kind: "ruler", state: null, connectionId: (player.socket.id ?? "") });
    expect(own).toEqual([]);
  } finally { await server.dispose(); }
});

test("private rulers stay with their scene and leaving or disconnecting ends them for old viewers", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server), room = await createRoom(server, cookie, "Rulers");
    const gm = await server.joinRoomAsGM(room.id, cookie), second = await server.joinRoomAsGM(room.id, cookie), openId = (gm.snapshot?.scene?.id ?? "");
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player"), other = await server.joinRoom(room.id, "", "other");
    const display = await server.joinDisplay(room.id, await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve)));
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Private" });
    await action(second.socket, "scene_view", { sceneId });
    const publicMessages: ReceivedLiveMessage[][] = [[], []], privateMessages: ReceivedLiveMessage[] = [];
    [player, display].forEach((peer, index) => peer.socket.on("live", value => publicMessages[index].push(value)));
    gm.socket.on("live", value => privateMessages.push(value));
    player.socket.emit("live", ruler(openId)); await barrier(player.socket);
    const privateRelay = nextMessage(second.socket, "live"); gm.socket.emit("live", ruler(sceneId));
    expect((await privateRelay)[0]).toEqual({ ...ruler(sceneId), connectionId: (gm.socket.id ?? "") });
    const sentinels = [player, display].map(peer => nextMessage(peer.socket, "live"));
    other.socket.emit("live", ruler(openId, 9)); await Promise.all(sentinels);
    expect(publicMessages[0]).toEqual([{ ...ruler(openId, 9), connectionId: (other.socket.id ?? "") }]);
    expect(publicMessages[1]).toEqual([{ ...ruler(openId), connectionId: (player.socket.id ?? "") }, { ...ruler(openId, 9), connectionId: (other.socket.id ?? "") }]);
    expect(privateMessages).toEqual([]);
    const received: ReceivedLiveMessage[] = []; second.socket.on("live", value => received.push(value));
    await action(gm.socket, "scene_view", { sceneId: openId }); await barrier(second.socket);
    expect(received.filter(value => value.kind === "ruler")).toEqual([{ sceneId, kind: "ruler", state: null, connectionId: (gm.socket.id ?? "") }]);
    const connectionId = (player.socket.id ?? ""), ended = nextMessage(display.socket, "live");
    player.socket.disconnect(); await ended; await barrier(display.socket);
    expect(publicMessages[1].filter(value => value.kind === "ruler" && value.state === null)).toEqual([{ sceneId: openId, kind: "ruler", state: null, connectionId }]);
  } finally { await server.dispose(); }
});

test("welcome-scene rulers pass among waiting people while the default welcome screen sends and receives none", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server), room = await createRoom(server, cookie, "Rulers");
    const gm = await server.joinRoomAsGM(room.id, cookie), sceneId = (gm.snapshot?.scene?.id ?? "");
    const player = await server.joinRoom(room.id, "", "player"), other = await server.joinRoom(room.id, "", "other");
    const display = await server.joinDisplay(room.id, await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve)));
    const received: unknown[][] = [[], [], [], []];
    [gm, player, other, display].forEach((peer, index) => peer.socket.on("live", value => received[index].push(value)));
    gm.socket.emit("live", ruler(sceneId)); await barrier(gm.socket);
    player.socket.emit("live", ruler(sceneId)); await barrier(player.socket);
    await action(gm.socket, "scene_welcome", { sceneId });
    const messages = [gm, other, display].map(peer => nextMessage(peer.socket, "live"));
    player.socket.emit("live", ruler(sceneId, 9)); await Promise.all(messages);
    expect(received).toEqual([
      [{ ...ruler(sceneId, 9), connectionId: (player.socket.id ?? "") }], [],
      [{ ...ruler(sceneId, 9), connectionId: (player.socket.id ?? "") }],
      [{ ...ruler(sceneId, 9), connectionId: (player.socket.id ?? "") }],
    ]);
  } finally { await server.dispose(); }
});
