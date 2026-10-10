import { expect, test } from "bun:test";
import { createRoom, inviteAccount, nextMessage, setupAdministrator, signIn, startTestServer } from "./testing/serverHelpers";

test("the room's signed-in GM joins on every device without the room password", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table", "secret");
    for (let device = 0; device < 2; device++) {
      const socket = server.connect(cookie);
      const joined = nextMessage(socket, "joined_game");
      socket.emit("join_game", room.id, "");
      const result = await joined;
      expect(result[2]).toEqual({ role: "gm", color: expect.stringMatching(/^(blue|orange|red|yellow|purple|green|pink|teal)$/), room: { name: "Table", session: false, hasPassword: true, switches: { tokens: true, drawing: true, notes: true, fog: false, uploads: false } } });
    }
  } finally { await server.dispose(); }
});

test("players cannot switch maps, edit map settings or replace state, but can update placed state", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    expect(player.info.role).toBe("player");
    const map = { id: "map", owner: "another browser", name: "Original", showGrid: true };
    const state = { mapId: "map", tokens: {}, drawings: {}, notes: {}, fogs: {} };
    for (const [event, value] of [["map", map], ["map_state", state]] as const) {
      const forwarded = nextMessage(player.socket, event);
      gm.socket.emit(event, value);
      expect((await forwarded)[0]).toEqual(value);
    }
    const received: string[] = [];
    gm.socket.on("map", () => received.push("map"));
    gm.socket.on("map_state", () => received.push("map_state"));
    for (const [event, value, original] of [
      ["map", { ...map, id: "other" }, map],
      ["map", { ...map, showGrid: false }, map],
      ["map_state", { ...state, tokens: { stolen: {} } }, state],
    ] as const) {
      const refused = nextMessage(player.socket, event);
      player.socket.emit(event, value);
      expect((await refused)[0]).toEqual(original);
    }
    const update = { id: "map", changes: [{ kind: "N", path: ["notes", "hello"], rhs: "Welcome" }] };
    const forwarded = nextMessage(gm.socket, "map_state_update");
    player.socket.emit("map_state_update", update);
    expect((await forwarded)[0]).toEqual(update);
    expect(received).toEqual([]);
    await new Promise(resolve => gm.socket.emit("room_switches", { uploads: true }, resolve));
    for (const [event, value] of [["manifest", { mapId: "map", assets: {} }], ["manifest_update", { id: "map", changes: [{ kind: "N", path: ["assets", "image"], rhs: { id: "image" } }] }]] as const) {
      const received = nextMessage(gm.socket, event);
      player.socket.emit(event, value);
      expect((await received)[0]).toEqual(value);
    }
    const settings = nextMessage(player.socket, "map");
    gm.socket.emit("map", { ...map, showGrid: false });
    expect((await settings)[0]).toEqual({ ...map, showGrid: false });
    const secondDevice = await server.joinRoomAsGM(room.id, cookie);
    expect(secondDevice.state.map).toEqual({ ...map, showGrid: false });
    expect(secondDevice.state.mapState.notes).toEqual({ hello: "Welcome" });
    for (const field of ["tokens", "drawings", "fogs", "notes"]) {
      const update = { id: "map", changes: [{ kind: "N", path: [field, "secondDevice"], rhs: {} }] };
      const received = nextMessage(player.socket, "map_state_update");
      secondDevice.socket.emit("map_state_update", update);
      expect((await received)[0]).toEqual(update);
    }
  } finally { await server.dispose(); }
});

test("party roles come from the server even when a browser claims to be GM", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    for (const [sender, observer, claimed, expected] of [[gm, player, "player", "gm"], [player, gm, "gm", "player"]] as const) {
      const party = nextMessage(observer.socket, "party_state");
      sender.socket.emit("player_state", { nickname: "Someone", dice: {}, role: claimed });
      expect((await party)[0][sender.socket.id!].role).toBe(expected);
    }
  } finally { await server.dispose(); }
});

test("sign-out notifies and disconnects every connection under that sign-in, leaving anonymous players", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const other = server.connect(cookie);
    await nextMessage(other, "connect");
    const player = await server.joinRoom(room.id);
    const ended = [gm.socket, other].map(socket => Promise.all([nextMessage(socket, "signed_out"), nextMessage(socket, "disconnect")]));
    expect((await fetch(`${server.address}/api/sign-out`, { method: "POST", headers: { Cookie: cookie } })).status).toBe(204);
    for (const messages of await Promise.all(ended)) expect(messages[0]).toEqual([]);
    expect(player.socket.connected).toBe(true);
    expect((await fetch(`${server.address}/assets/missing`, { headers: { Authorization: `Bearer ${gm.token}` } })).status).toBe(401);
  } finally { await server.dispose(); }
});

test("the GM without a sign-in, another account and a foreign administrator are players", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const gm = await inviteAccount(server, admin.cookie, "GameMaster", "test-password");
    const other = await inviteAccount(server, admin.cookie, "Another", "test-password");
    const room = await createRoom(server, gm.cookie, "Table", "secret");
    for (const cookie of [undefined, other.cookie, admin.cookie]) {
      const socket = server.connect(cookie);
      const refused = nextMessage(socket, "auth_error");
      socket.emit("join_game", room.id, "");
      expect(await refused).toEqual([]);
      const joined = nextMessage(socket, "joined_game");
      socket.emit("join_game", room.id, "secret");
      expect((await joined)[2].role).toBe("player");
    }
  } finally { await server.dispose(); }
});

test("GM joins neither count as password guesses nor obey the password attempt limit", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table", "secret");
    for (let guess = 0; guess < 5; guess++) {
      const gm = server.connect(cookie);
      const joined = nextMessage(gm, "joined_game");
      gm.emit("join_game", room.id, "wrong");
      expect((await joined)[2].role).toBe("gm");
    }
    const player = await server.joinRoom(room.id, "secret");
    expect(player.info.role).toBe("player");
    const guesses = server.connect();
    for (let guess = 0; guess < 5; guess++) {
      const refused = nextMessage(guesses, "auth_error");
      guesses.emit("join_game", room.id, "wrong");
      await refused;
    }
    const limited = nextMessage(guesses, "auth_wait");
    guesses.emit("join_game", room.id, "secret");
    expect((await limited)[0]).toBe(300);
    expect((await server.joinRoomAsGM(room.id, cookie)).info.role).toBe("gm");
  } finally { await server.dispose(); }
}, 15000);

for (const ending of ["reset", "change", "removal", "lapse"] as const) {
  test(`${ending} notifies and disconnects signed-in players as well as GMs`, async () => {
    const server = await startTestServer();
    try {
      const admin = await setupAdministrator(server);
      const account = await inviteAccount(server, admin.cookie, "GameMaster", "test-password");
      const second = await signIn(server, "GameMaster", "test-password");
      const ownRoom = await createRoom(server, account.cookie, "Owned");
      const otherRoom = await createRoom(server, admin.cookie, "Other");
      const gm = await server.joinRoomAsGM(ownRoom.id, account.cookie);
      const player = await server.joinRoomAsGM(otherRoom.id, account.cookie);
      expect(player.info.role).toBe("player");
      const survivor = await server.joinRoomAsGM(ownRoom.id, second.cookie);
      expect(survivor.info.role).toBe("gm");
      const ended = [gm.socket, player.socket].map(socket => Promise.all([nextMessage(socket, "signed_out"), nextMessage(socket, "disconnect")]));
      const otherEnded = ending === "change" ? undefined : Promise.all([nextMessage(survivor.socket, "signed_out"), nextMessage(survivor.socket, "disconnect")]);
      if (ending === "lapse") {
        await server.clock.advance(30 * 24 * 60 * 60 * 1000);
      } else {
        let path: string;
        let method = "POST";
        let cookie = admin.cookie;
        let body: unknown;
        if (ending === "reset") {
          const response = await fetch(`${server.address}/api/admin/accounts/${account.account.id}/reset-link`, { method: "POST", headers: { Cookie: admin.cookie } });
          const { token } = await response.json() as any;
          path = `resets/${token}`;
          body = { password: "new-password" };
        } else if (ending === "change") {
          path = "account/password";
          cookie = second.cookie;
          body = { currentPassword: "test-password", newPassword: "new-password" };
        } else {
          path = `admin/accounts/${account.account.id}`;
          method = "DELETE";
        }
        const response = await fetch(`${server.address}/api/${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
        expect(response.status).toBe(ending === "reset" ? 200 : 204);
      }
      for (const messages of await Promise.all(ended)) expect(messages[0]).toEqual([]);
      if (otherEnded) expect((await otherEnded)[0]).toEqual([]);
      else expect(survivor.socket.connected).toBe(true);
    } finally { await server.dispose(); }
  });
}

test("HTTP use renews a socket's sign-in and lapse follows the renewed deadline", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const day = 24 * 60 * 60 * 1000;
    expect(server.clock.maximumScheduledDelay).toBeLessThanOrEqual(2147483647);
    await server.clock.advance(29 * day);
    expect((await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } })).status).toBe(200);
    await server.clock.advance(day);
    expect(gm.socket.connected).toBe(true);
    const ended = Promise.all([nextMessage(gm.socket, "signed_out"), nextMessage(gm.socket, "disconnect")]);
    await server.clock.advance(29 * day);
    expect((await ended)[0]).toEqual([]);
  } finally { await server.dispose(); }
});

test("cast displays receive current map and state when they attempt GM changes", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    gm.socket.emit("player_state", { nickname: "GM", userId: "gm" });
    gm.socket.emit("map", { id: "map", owner: "gm" });
    gm.socket.emit("map_state", { mapId: "map", notes: {} });
    const link = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, link);
    for (const [event, original] of [["map", { id: "map", owner: "gm" }], ["map_state", { mapId: "map", notes: {} }]] as const) {
      const refused = nextMessage(display.socket, event);
      display.socket.emit(event, { id: "evil", mapId: "evil" });
      expect((await refused)[0]).toEqual(original);
    }
  } finally { await server.dispose(); }
});
