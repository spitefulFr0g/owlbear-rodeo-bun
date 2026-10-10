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
    const departed = nextMessage(invalid.socket, "party_state");
    second.socket.disconnect();
    await departed;
    expect((await join(server, other.id)).info.color).toBe(second.info.color);
  } finally { await server.dispose(); }
}, 15000);

test("player state broadcasts valid colours and preserves the assigned colour for missing or unknown values", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Live colours");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    expect(colours).toContain(gm.info.color);
    const player = await join(server, room.id, "pink");
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    expect(display.info.color).toBeUndefined();
    for (const color of [undefined, "teal", "unknown", null, {}, 1, "TEAL"]) {
      const updates = [gm, display].map(peer => nextMessage(peer.socket, "party_state"));
      player.socket.emit("player_state", { nickname: "Player", color });
      for (const [party] of await Promise.all(updates)) {
        expect(party[player.socket.id!].color).toBe(color === undefined ? "pink" : "teal");
        expect(party[display.socket.id!]).toBeUndefined();
      }
    }
    const update = nextMessage(gm.socket, "party_state");
    display.socket.emit("player_state", { color: "red" });
    player.socket.emit("player_state", { nickname: "Still teal" });
    const [party] = await update;
    expect(party[player.socket.id!].color).toBe("teal");
    expect(party[display.socket.id!]).toBeUndefined();
  } finally { await server.dispose(); }
}, 15000);
