import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { maxLiveMessagesPerSecond, ReceivedLiveMessage } from "../../src/sceneRules";
import { createRoom, nextMessage, setupAdministrator, startTestServer, sendBatch } from "./testing/serverHelpers";
import { tokenItem } from "./testing/sceneFixtures";
const action = (socket: Socket, event: string, value: unknown) => new Promise<{ ok: boolean; sceneId: string }>(resolve => socket.emit(event, value, resolve));
const barrier = (socket: Socket) => new Promise(resolve => socket.emit("get_display_token", resolve));
const pointer = (sceneId: string, x = 1) => ({ sceneId, kind: "pointer", state: { position: { x, y: 2 }, visible: true } });

test("live pointers name their sender and reach only other viewers, including cast displays", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server), room = await createRoom(server, cookie, "Live");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player"), other = await server.joinRoom(room.id, "", "other");
    const display = await server.joinDisplay(room.id, await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve)));
    const sceneId = (gm.snapshot?.scene?.id ?? "");
    const received = [gm, other, display].map(peer => nextMessage(peer.socket, "live"));
    player.socket.emit("live", { ...pointer(sceneId), connectionId: "forged", state: { ...pointer(sceneId).state, color: "red" } });
    for (const result of await Promise.all(received)) expect(result[0]).toEqual({ ...pointer(sceneId), connectionId: player.socket.id });
    const own: unknown[] = [], unwanted: unknown[] = [];
    player.socket.on("live", value => own.push(value));
    gm.socket.on("live", value => unwanted.push(value));
    display.socket.emit("live", pointer(sceneId));
    player.socket.emit("live", pointer("wrong"));
    player.socket.emit("live", { ...pointer(sceneId), state: {} });
    const sentinel = nextMessage(gm.socket, "live");
    player.socket.emit("live", pointer(sceneId, 3));
    await sentinel;
    expect(unwanted).toEqual([{ ...pointer(sceneId, 3), connectionId: player.socket.id }]);
    expect(own).toEqual([]);
    const before = gm.snapshot;
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot).toEqual(before);
  } finally { await server.dispose(); }
});

test("live update limits reset on the test clock and never block reliable ends", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server), room = await createRoom(server, cookie, "Live");
    const gm = await server.joinRoomAsGM(room.id, cookie), peer = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = (gm.snapshot?.scene?.id ?? ""), received: ReceivedLiveMessage[] = [];
    peer.socket.on("live", value => received.push(value));
    for (let i = 0; i < maxLiveMessagesPerSecond + 2; i++) gm.socket.emit("live", pointer(sceneId, i));
    const end = nextMessage(peer.socket, "live");
    gm.socket.emit("live", { sceneId, kind: "pointer", state: null });
    await end; await barrier(gm.socket); await barrier(peer.socket);
    expect(received).toHaveLength(maxLiveMessagesPerSecond + 1);
    expect(received.at(-1)?.state).toBeNull();
    await server.clock.advance(1000);
    const resumed = nextMessage(peer.socket, "live");
    gm.socket.emit("live", pointer(sceneId, 999));
    expect((await resumed)[0]).toEqual({ ...pointer(sceneId, 999), connectionId: gm.socket.id });
  } finally { await server.dispose(); }
});

test("leaving a scene and disconnecting reliably end every kind for old viewers", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server), room = await createRoom(server, cookie, "Live");
    const gm = await server.joinRoomAsGM(room.id, cookie), peer = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = (gm.snapshot?.scene?.id ?? ""), received: unknown[] = [];
    peer.socket.on("live", value => received.push(value));
    const created = await action(gm.socket, "scene_create", { name: "Private" });
    await barrier(peer.socket);
    expect(received).toEqual(["pointer", "ruler", "drag"].map(kind => ({ sceneId, kind, state: null, connectionId: gm.socket.id })));
    await action(peer.socket, "scene_view", { sceneId: created.sceneId });
    received.length = 0;
    const connectionId = gm.socket.id;
    const ended = nextMessage(peer.socket, "live");
    gm.socket.disconnect(); await ended; await barrier(peer.socket);
    expect(received).toEqual(["pointer", "ruler", "drag"].map(kind => ({ sceneId: created.sceneId, kind, state: null, connectionId })));
  } finally { await server.dispose(); }
});

test("private scenes isolate live traffic while welcome scenes allow pointing and measuring", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server), room = await createRoom(server, cookie, "Live");
    const gm = await server.joinRoomAsGM(room.id, cookie), second = await server.joinRoomAsGM(room.id, cookie);
    const openId = (gm.snapshot?.scene?.id ?? "");
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player");
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Private" });
    await action(second.socket, "scene_view", { sceneId });
    const received: unknown[] = []; player.socket.on("live", value => received.push(value));
    const privatePointer = nextMessage(second.socket, "live");
    gm.socket.emit("live", pointer(sceneId)); await privatePointer;
    const publicPointer = nextMessage(player.socket, "live");
    second.socket.emit("live", pointer(openId));
    await action(gm.socket, "scene_view", { sceneId: openId });
    gm.socket.emit("live", pointer(openId, 4)); await publicPointer;
    expect(received).toEqual([{ ...pointer(openId, 4), connectionId: gm.socket.id }]);
    await action(gm.socket, "session", false);
    received.length = 0;
    gm.socket.emit("live", pointer(openId)); await barrier(gm.socket);
    await action(gm.socket, "scene_welcome", { sceneId: openId });
    const welcomePointer = nextMessage(player.socket, "live");
    gm.socket.emit("live", pointer(openId, 5)); await welcomePointer;
    expect(received).toEqual([{ ...pointer(openId, 5), connectionId: gm.socket.id }]);
    const ruler = nextMessage(gm.socket, "live");
    player.socket.emit("live", { sceneId: openId, kind: "ruler", state: { start: { x: 1, y: 2 }, end: { x: 3, y: 4 } } });
    expect((await ruler)[0].connectionId).toBe(player.socket.id);
  } finally { await server.dispose(); }
});

test("live drags use current change permissions and visibility for each receiver", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server), room = await createRoom(server, cookie, "Live");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player"), other = await server.joinRoom(room.id, "", "other");
    const display = await server.joinDisplay(room.id, await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve)));
    const sceneId = (gm.snapshot?.scene?.id ?? "");
    await sendBatch(gm.socket, { id: "seed", sceneId, changes: [
      { type: "add", item: tokenItem }, { type: "add", item: { ...tokenItem, id: "hidden", hidden: true, owner: "player" } },
      { type: "add", item: { ...tokenItem, id: "locked", locked: true } },
    ] });
    // Ownership is set on creation; give the hidden token to its player.
    await sendBatch(gm.socket, { id: "owner", sceneId, changes: [{ type: "update", id: "hidden", fields: { owner: "player" } }] });
    const transform = (id: string) => ({ id, position: { x: 10, y: 20 }, rotation: 0, scale: { x: 1, y: 1 } });
    const drag = { sceneId, kind: "drag", state: { items: [transform("hero"), transform("hidden")] } };
    const messages = [player, other, display].map(peer => nextMessage(peer.socket, "live"));
    gm.socket.emit("live", drag);
    const results = await Promise.all(messages);
    expect(results[0][0].state.items).toEqual(drag.state.items);
    for (const result of results.slice(1)) expect(result[0].state.items).toEqual([transform("hero")]);
    const received: unknown[] = []; gm.socket.on("live", value => received.push(value));
    player.socket.emit("live", { ...drag, state: { items: [transform("locked"), transform("missing")] } });
    await action(gm.socket, "scene_settings", { sceneId, viewOnly: true });
    player.socket.emit("live", drag);
    const sentinel = nextMessage(gm.socket, "live"); player.socket.emit("live", pointer(sceneId)); await sentinel;
    expect(received).toEqual([{ ...pointer(sceneId), connectionId: player.socket.id }]);
  } finally { await server.dispose(); }
});
