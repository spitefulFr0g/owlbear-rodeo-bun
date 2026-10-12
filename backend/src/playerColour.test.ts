import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const colours = ["blue", "orange", "red", "yellow", "purple", "green", "pink", "teal"];
async function join(server: Awaited<ReturnType<typeof startTestServer>>, roomId: string, color?: unknown) {
  const socket = server.connect();
  const joined = nextMessage(socket, "joined_game");
  socket.emit("join_game", roomId, "", undefined, { color });
  const [, , info] = await joined;
  return { socket, info };
}

test("joins reserve unused colours before player state, keep chosen duplicates and reuse departed colours", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Colours");
    const peers = [];
    for (let i = 0; i < colours.length; i++) peers.push(await join(server, room.id));
    expect(new Set(peers.map(peer => peer.info.color))).toEqual(new Set(colours));
    expect(colours).toContain((await join(server, room.id)).info.color);
    for (const color of colours) expect((await join(server, room.id, color)).info.color).toBe(color);
    const other = await createRoom(server, cookie, "Other colours");
    const invalid = await join(server, other.id, "unknown");
    expect(colours).toContain(invalid.info.color);
    const second = await join(server, other.id, null);
    expect(second.info.color).not.toBe(invalid.info.color);
    const departed = nextMessage(invalid.socket, "presence_state");
    second.socket.disconnect();
    await departed;
    expect((await join(server, other.id)).info.color).toBe(second.info.color);
  } finally { await server.dispose(); }
}, 15000);

test("presence broadcasts chosen player colours and excludes cast displays", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Live colours");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await join(server, room.id, "pink");
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    for (const color of colours) {
      const updates = [gm, display].map(peer => nextMessage(peer.socket, "presence_state"));
      player.socket.emit("presence_update", { nickname: "Player", color, dice: { share: false, rolls: [] } });
      for (const [state] of await Promise.all(updates)) {
        expect(state[player.socket.id!].color).toBe(color);
        expect(state[display.socket.id!]).toBeUndefined();
      }
    }
  } finally { await server.dispose(); }
}, 15000);
