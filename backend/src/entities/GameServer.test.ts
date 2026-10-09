import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createServer, Server as HttpServer } from "http";
import { AddressInfo } from "net";
import { Server } from "socket.io";
import { io as connect, Socket } from "socket.io-client";
// @ts-ignore
import msgParser from "socket.io-msgpack-parser";
import GameServer from "./GameServer";
import JoinTokens from "./JoinTokens";

let httpServer: HttpServer;
let io: Server;
let url: string;
const joinTokens = new JoinTokens();
const sockets: Socket[] = [];

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer, { parser: msgParser });
  new GameServer(io, joinTokens).run();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    socket.disconnect();
  }
});

afterAll(() => {
  io.close();
});

function client(): Socket {
  const socket = connect(url, { parser: msgParser, transports: ["websocket"] });
  sockets.push(socket);
  return socket;
}

function next(socket: Socket, event: string): Promise<any[]> {
  return new Promise((resolve) => socket.once(event, (...args) => resolve(args)));
}

async function join(socket: Socket, gameId: string, password = "") {
  const joined = next(socket, "joined_game");
  socket.emit("join_game", gameId, password);
  return joined;
}

async function until(condition: () => boolean) {
  while (!condition()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("joining a game", () => {
  test("gives the player a token for that game", async () => {
    const socket = client();
    const [socketId, token] = await join(socket, "game-token");
    expect(socketId).toBe(socket.id);
    expect(joinTokens.verify(token)).toBe("game-token");
  });

  test("does not show a player's token to the rest of the game", async () => {
    const first = client();
    await join(first, "game-private");
    const seenByFirst = next(first, "joined_game");
    const second = client();
    const [, token] = await join(second, "game-private");
    expect(await seenByFirst).toEqual([second.id]);
    expect(joinTokens.verify(token)).toBe("game-private");
  });

  test("gives no token for a wrong password", async () => {
    await join(client(), "game-locked", "secret");
    const intruder = client();
    let joined = false;
    intruder.on("joined_game", () => {
      joined = true;
    });
    const refused = next(intruder, "auth_error");
    intruder.emit("join_game", "game-locked", "wrong");
    await refused;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(joined).toBe(false);
  });

  test("the token stops working when the player disconnects", async () => {
    const socket = client();
    const [, token] = await join(socket, "game-leave");
    socket.disconnect();
    await until(() => joinTokens.verify(token) === undefined);
    expect(joinTokens.verify(token)).toBeUndefined();
  });
});

function displayToken(socket: Socket): Promise<string | null> {
  return new Promise((resolve) => socket.emit("get_display_token", resolve));
}

async function owner(gameId: string) {
  const socket = client();
  await join(socket, gameId, "secret");
  socket.emit("player_state", { userId: "gm", nickname: "GM" });
  socket.emit("map", { id: "map-1", owner: "gm" });
  return { socket, token: await displayToken(socket) };
}

describe("cast displays", () => {
  test("only the current map owner can obtain the room's display token", async () => {
    const { socket, token } = await owner("display-token");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await displayToken(socket)).toBe(token);
    const other = client();
    expect(await displayToken(other)).toBeNull();
    await join(other, "display-token", "secret");
    other.emit("player_state", { userId: "other" });
    expect(await displayToken(other)).toBeNull();
    socket.emit("map", { id: "map-2", owner: "other" });
    expect(await displayToken(socket)).toBeNull();
    expect(await displayToken(other)).toBe(token);
    socket.emit("map", null);
    expect(await displayToken(other)).toBeNull();
  });
});

async function joinDisplay(socket: Socket, gameId: string, token: string | null) {
  const joined = next(socket, "joined_display");
  socket.emit("join_display", gameId, token);
  return joined;
}

function record(socket: Socket) {
  const events: any[][] = [];
  socket.onAny((...args) => events.push(args));
  return events;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 50));

test("a cast display receives initial and live state without player presence", async () => {
  const { socket: player, token } = await owner("display-live");
  player.emit("map_state", { mapId: "map-1", notes: {} });
  player.emit("manifest", { mapId: "map-1", assets: [] });
  await displayToken(player);
  const playerEvents = record(player);
  const display = client();
  const events = record(display);
  const [id, joinToken] = await joinDisplay(display, "display-live", token);
  expect(id).toBe(display.id);
  expect(joinTokens.verify(joinToken)).toBe("display-live");
  expect(joinTokens.canUpload(joinToken)).toBe(false);
  expect(events.map(([event]) => event)).toEqual([
    "party_state", "map_state", "map", "manifest", "joined_display",
  ]);
  expect(events[0][1]).toEqual({ [player.id!]: { userId: "gm", nickname: "GM" } });
  expect(events[1][1]).toEqual({ mapId: "map-1", notes: {} });
  expect(events[2][1]).toEqual({ id: "map-1", owner: "gm" });
  expect(events[3][1]).toEqual({ mapId: "map-1", assets: [] });
  expect(await displayToken(display)).toBeNull();
  for (const [event, payload] of [
    ["map", { id: "map-2", owner: "gm" }],
    ["map_state", { mapId: "map-2", notes: {} }],
    ["map_state_update", { id: "map-2", changes: [{ kind: "N", path: ["notes", "note"], rhs: "hello" }] }],
  ] as const) {
    const received = next(display, event);
    player.emit(event, payload);
    expect(await received).toEqual([payload]);
  }
  const party = next(display, "party_state");
  player.emit("player_state", { userId: "gm", nickname: "Changed" });
  expect(Object.keys((await party)[0])).toEqual([player.id!]);
  display.disconnect();
  await until(() => joinTokens.verify(joinToken) === undefined);
  await pause();
  expect(playerEvents).toEqual([]);
});

for (const [label, room, token] of [
  ["wrong token", "display-refuse", "wrong"],
  ["missing token", "display-refuse", undefined],
  ["nonexistent room", "display-absent", "wrong"],
] as const) {
  test(`refuses a display with ${label} without joining any room`, async () => {
    const { socket: player } = await owner("display-refuse");
    const display = client();
    const events = record(display);
    const refused = next(display, "display_error");
    display.emit("join_display", room, token);
    await refused;
    player.emit("map", { id: "not-for-display", owner: "gm" });
    await pause();
    expect(events.map(([event]) => event)).toEqual(["display_error"]);
    expect(io.sockets.sockets.get(display.id!)?.rooms.size).toBe(1);
  });
}

for (const [event, payload] of [
  ["map", { id: "evil", owner: "display" }],
  ["map_state", { mapId: "map-1", notes: { evil: true } }],
  ["map_state_update", { id: "map-1", changes: [{ kind: "N", path: ["notes", "evil"], rhs: true }] }],
  ["player_state", { userId: "gm", nickname: "Display" }],
  ["manifest", { mapId: "map-1", assets: ["evil"] }],
  ["manifest_update", { id: "map-1", changes: [{ kind: "N", path: ["evil"], rhs: true }] }],
  ["player_pointer", { x: 1, y: 2 }],
  ["display_view", { mapId: "map-1", x: 0, y: 0, width: 1, height: 1 }],
  ["display_freeze", true],
] as const) {
  test(`ignores a cast display's ${event} without forwarding or changing state`, async () => {
    const gameId = `display-write-${event}`;
    const { socket: player, token } = await owner(gameId);
    player.emit("map_state", { mapId: "map-1", notes: {} });
    player.emit("manifest", { mapId: "map-1", assets: [] });
    await displayToken(player);
    const display = client();
    await joinDisplay(display, gameId, token);
    const playerEvents = record(player);
    display.emit(event, payload);
    expect(await displayToken(display)).toBeNull();
    await pause();
    expect(playerEvents).toEqual([]);
    const observer = client();
    const snapshot = record(observer);
    await joinDisplay(observer, gameId, token);
    expect(snapshot[0][1]).toEqual({ [player.id!]: { userId: "gm", nickname: "GM" } });
    expect(snapshot[1][1]).toEqual({ mapId: "map-1", notes: {} });
    expect(snapshot[2][1]).toEqual({ id: "map-1", owner: "gm" });
    expect(snapshot[3][1]).toEqual({ mapId: "map-1", assets: [] });
  });
}

test("a cast display cannot rejoin as a player or join a second room", async () => {
  const { token } = await owner("display-single-room");
  const { token: secondToken } = await owner("display-second-room");
  const display = client();
  await joinDisplay(display, "display-single-room", token);
  const events = record(display);
  display.emit("join_game", "display-second-room", "secret");
  const refused = next(display, "display_error");
  display.emit("join_display", "display-second-room", secondToken);
  await refused;
  expect(events.map(([event]) => event)).toEqual(["display_error"]);
  expect([...io.sockets.sockets.get(display.id!)!.rooms]).toEqual([
    display.id!, "display-single-room",
  ]);
});

test("a pending player join cannot also join as a cast display", async () => {
  const { token } = await owner("display-pending-target");
  const socket = client();
  await next(socket, "connect");
  const events = record(socket);
  const joined = next(socket, "joined_game");
  socket.emit("join_game", "display-pending-player", "secret");
  socket.emit("join_display", "display-pending-target", token);
  await joined;
  await pause();
  expect(events.some(([event]) => event === "joined_display")).toBe(false);
  expect(events.some(([event]) => event === "display_error")).toBe(true);
  expect([...io.sockets.sockets.get(socket.id!)!.rooms]).toEqual([
    socket.id!, "display-pending-player",
  ]);
});
