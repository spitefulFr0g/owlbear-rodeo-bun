import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
const update = { nickname: "Player", color: "teal", dice: { share: true, rolls: [{ type: "d20", roll: 20 }] }, timer: { current: 30, max: 60 } };

test("presence reaches every room connection across scenes and outside sessions, with authoritative identity", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Presence");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const secondGM = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id, "", "browser-id");
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const other = await server.joinRoom((await createRoom(server, cookie, "Other")).id);
    const unrelated: unknown[] = [];
    other.socket.on("presence_state", state => unrelated.push(state));
    const created = await new Promise<{ ok: boolean; sceneId: string }>(resolve => gm.socket.emit("scene_create", { name: "Preparation" }, resolve));
    expect(created.ok).toBe(true);
    expect(created.sceneId).not.toBe(player.snapshot!.scene?.id);
    for (const session of [false, true]) {
      await new Promise(resolve => gm.socket.emit("session", session, resolve));
      const messages = [gm, secondGM, player, display].map(peer => nextMessage(peer.socket, "presence_state"));
      player.socket.emit("presence_update", { ...update, userId: "forged", role: "gm", sessionId: "forged", sceneId: "secret", nested: { secret: 1 } });
      for (const [state] of await Promise.all(messages)) {
        expect(state[player.socket.id!]).toEqual({ ...update, userId: "browser-id", sessionId: player.socket.id, role: "player" });
        expect(state[gm.socket.id!].role).toBe("gm");
        expect(state[secondGM.socket.id!].role).toBe("gm");
        expect(state[display.socket.id!]).toBeUndefined();
      }
    }
    expect(unrelated).toEqual([]);
  } finally { await server.dispose(); }
});

test("malformed presence keeps the last good state, private dice are removed, and displays cannot publish", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Validation");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id, "", "browser");
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const good = nextMessage(gm.socket, "presence_state");
    player.socket.emit("presence_update", update);
    const lastGood = (await good)[0][player.socket.id!];
    const received: unknown[] = [];
    gm.socket.on("presence_state", state => received.push(state));
    for (const bad of [null, {}, { ...update, nickname: "x".repeat(101) }, { ...update, color: "black" }, { ...update, dice: { share: true, rolls: Array(101).fill({ type: "d6", roll: 1 }) } }, { ...update, timer: { current: "bad", max: 1 } }]) player.socket.emit("presence_update", bad);
    await new Promise(resolve => player.socket.emit("get_display_token", resolve));
    display.socket.emit("presence_update", update);
    await new Promise(resolve => display.socket.emit("get_display_token", resolve));
    const states = [gm, display].map(peer => nextMessage(peer.socket, "presence_state"));
    gm.socket.emit("presence_update", { ...update, nickname: "Barrier" });
    for (const [state] of await Promise.all(states)) {
      expect(state[player.socket.id!]).toEqual(lastGood);
      expect(state[display.socket.id!]).toBeUndefined();
    }
    expect(received).toHaveLength(1);
    const privateStates = [gm, player, display].map(peer => nextMessage(peer.socket, "presence_state"));
    player.socket.emit("presence_update", { ...update, dice: { ...update.dice, share: false } });
    for (const [state] of await Promise.all(privateStates)) expect(state[player.socket.id!].dice).toEqual({ share: false, rolls: [] });
    const id = player.socket.id!;
    const removed = [gm, display].map(peer => nextMessage(peer.socket, "presence_state"));
    player.socket.disconnect();
    for (const [state] of await Promise.all(removed)) expect(state[id]).toBeUndefined();
  } finally { await server.dispose(); }
});

test("the old party message is not relayed and changes nobody's presence", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Old messages");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id, "", "browser");
    const received: unknown[][] = [];
    gm.socket.onAny((...message) => received.push(message));
    player.socket.emit("player_state", update);
    const state = nextMessage(gm.socket, "presence_state");
    player.socket.emit("presence_update", { ...update, nickname: "Barrier" });
    expect((await state)[0][player.socket.id!].nickname).toBe("Barrier");
    expect(received.map(([event]) => event)).toEqual(["presence_state"]);
  } finally { await server.dispose(); }
});
