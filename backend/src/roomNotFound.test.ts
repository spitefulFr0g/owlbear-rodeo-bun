import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

test("a missing room refuses only the joiner and stays missing on later joins and after restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    for (let attempt = 0; attempt < 3; attempt++) {
      const socket = server.connect();
      const events: string[] = [];
      socket.onAny(event => events.push(event));
      const refused = nextMessage(socket, "room_not_found");
      socket.emit("join_game", "missing-room", "");
      expect(await refused).toEqual([]);
      await new Promise(resolve => socket.emit("get_display_token", resolve));
      expect(events).toEqual(["room_not_found"]);
      socket.disconnect();
      if (attempt === 1) await server.restart();
    }
    const response = await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } });
    expect(await response.json()).toEqual({ rooms: [] });
  } finally { await server.dispose(); }
});

test("a display link to a missing room creates nothing, including after restart", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    for (let attempt = 0; attempt < 2; attempt++) {
      const socket = server.connect();
      const events: string[] = [];
      socket.onAny(event => events.push(event));
      const refused = nextMessage(socket, "display_error");
      socket.emit("join_display", "missing-display-room", "wrong");
      expect(await refused).toEqual([]);
      const missing = nextMessage(socket, "room_not_found");
      socket.emit("join_game", "missing-display-room", "");
      expect(await missing).toEqual([]);
      await new Promise(resolve => socket.emit("get_display_token", resolve));
      expect(events).toEqual(["display_error", "room_not_found"]);
      await server.restart();
    }
  } finally { await server.dispose(); }
});

test("missing rooms never consume password attempts, even while the address is refused", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Protected", "secret");
    const resident = await server.joinRoom(room.id, "secret");
    const residentEvents: string[] = [];
    resident.socket.onAny(event => residentEvents.push(event));
    const socket = server.connect();
    for (let i = 0; i < 6; i++) {
      const missing = nextMessage(socket, "room_not_found");
      socket.emit("join_game", "missing-room", "wrong");
      expect(await missing).toEqual([]);
    }
    for (let i = 0; i < 5; i++) {
      const wrong = nextMessage(socket, "auth_error");
      socket.emit("join_game", room.id, "wrong");
      expect(await wrong).toEqual([]);
    }
    const wait = nextMessage(socket, "auth_wait");
    socket.emit("join_game", room.id, "secret");
    expect(await wait).toEqual([300]);
    const missing = nextMessage(socket, "room_not_found");
    socket.emit("join_game", "missing-room", "secret");
    expect(await missing).toEqual([]);
    await new Promise(resolve => resident.socket.emit("get_display_token", resolve));
    expect(residentEvents).toEqual([]);
    await server.clock.advance(300_000);
    const joined = nextMessage(socket, "joined_game");
    socket.emit("join_game", room.id, "secret");
    expect((await joined)[1]).toBeString();
  } finally { await server.dispose(); }
});

test("object property names are missing room ids for players and cast displays", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    const socket = server.connect();
    for (const id of ["__proto__", "constructor", "toString"]) {
      const missing = nextMessage(socket, "room_not_found");
      socket.emit("join_game", id, "");
      expect(await missing).toEqual([]);
      const displayError = nextMessage(socket, "display_error");
      socket.emit("join_display", id, "wrong");
      expect(await displayError).toEqual([]);
    }
  } finally { await server.dispose(); }
});
