import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { createRoom, setupAdministrator, startTestServer } from "../testing/serverHelpers";

let server: Awaited<ReturnType<typeof startTestServer>>;
const sockets: Socket[] = [];
let cookie: string;
const rooms = new Map<string, string>();

async function roomId(name: string, password = "") {
  if (!rooms.has(name)) rooms.set(name, (await createRoom(server, cookie, name, password)).id);
  return rooms.get(name)!;
}

beforeAll(async () => {
  server = await startTestServer();
  ({ cookie } = await setupAdministrator(server));
});

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

afterAll(async () => { await server.dispose(); });

function client(): Socket {
  const socket = server.connect();
  sockets.push(socket);
  return socket;
}

async function assetStatus(token: string, method = "GET") {
  const response = await fetch(`${server.address}/assets/missing-image`, {
    method, headers: { Authorization: `Bearer ${token}` },
  });
  await response.text();
  return response.status;
}

function next(socket: Socket, event: string): Promise<any[]> {
  return new Promise((resolve) => socket.once(event, (...args) => resolve(args)));
}

async function join(socket: Socket, gameId: string, password = "") {
  const frozen = next(socket, "display_frozen");
  const joined = next(socket, "joined_game");
  socket.emit("join_game", await roomId(gameId, password), password);
  const result = await joined;
  await frozen;
  return result;
}

describe("joining a game", () => {
  test("gives the player a token for that game", async () => {
    const socket = client();
    const [socketId, token] = await join(socket, "game-token");
    expect(socketId).toBe(socket.id);
    expect(await assetStatus(token)).toBe(404);
  });

  test("does not show a player's token to the rest of the game", async () => {
    const first = client();
    await join(first, "game-private");
    const seenByFirst = next(first, "joined_game");
    const second = client();
    const [, token] = await join(second, "game-private");
    expect(await seenByFirst).toEqual([second.id]);
    expect(await assetStatus(token)).toBe(404);
  });

  test("gives no token for a wrong password", async () => {
    await join(client(), "game-locked", "secret");
    const intruder = client();
    let joined = false;
    intruder.on("joined_game", () => {
      joined = true;
    });
    const refused = next(intruder, "auth_error");
    intruder.emit("join_game", rooms.get("game-locked")!, "wrong");
    await refused;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(joined).toBe(false);
  });

  test("the token stops working when the player disconnects", async () => {
    const socket = client();
    const [, token] = await join(socket, "game-leave");
    const observer = client();
    await join(observer, "game-leave");
    const left = next(observer, "player_left");
    socket.disconnect();
    await left;
    expect(await assetStatus(token)).toBe(401);
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
  const frozen = next(socket, "display_frozen");
  const joined = next(socket, "joined_display");
  socket.emit("join_display", rooms.get(gameId)!, token);
  const result = await joined;
  await frozen;
  await displayToken(socket);
  return result;
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
  expect(await assetStatus(joinToken)).toBe(404);
  expect(await assetStatus(joinToken, "PUT")).toBe(403);
  expect(events.map(([event]) => event)).toEqual([
    "party_state", "map_state", "map", "manifest", "joined_display", "display_frozen",
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
  await pause();
  expect(await assetStatus(joinToken)).toBe(401);
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
    display.emit("join_display", rooms.get(room) ?? room, token);
    await refused;
    player.emit("map", { id: "not-for-display", owner: "gm" });
    await pause();
    expect(events.map(([event]) => event)).toEqual(["display_error"]);
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
    expect(snapshot.filter(([name]) => name === "display_frozen")).toEqual([["display_frozen", false]]);
    expect(snapshot.filter(([name]) => name === "display_view")).toEqual([]);
  });
}

test("a cast display cannot rejoin as a player or join a second room", async () => {
  const { token } = await owner("display-single-room");
  const { token: secondToken } = await owner("display-second-room");
  const display = client();
  await joinDisplay(display, "display-single-room", token);
  const events = record(display);
  display.emit("join_game", rooms.get("display-second-room")!, "secret");
  const refused = next(display, "display_error");
  display.emit("join_display", rooms.get("display-second-room")!, secondToken);
  await refused;
  expect(events.map(([event]) => event)).toEqual(["display_error"]);
  const player = client();
  await join(player, "display-single-room", "secret");
  const received = next(display, "map");
  player.emit("map", { id: "still-first-room", owner: "gm" });
  expect(await received).toEqual([{ id: "still-first-room", owner: "gm" }]);
});

test("a pending player join cannot also join as a cast display", async () => {
  const { token } = await owner("display-pending-target");
  const pendingRoom = await roomId("display-pending-player", "secret");
  const socket = client();
  await next(socket, "connect");
  const events = record(socket);
  const joined = next(socket, "joined_game");
  socket.emit("join_game", pendingRoom, "secret");
  socket.emit("join_display", rooms.get("display-pending-target")!, token);
  await joined;
  await pause();
  expect(events.some(([event]) => event === "joined_display")).toBe(false);
  expect(events.some(([event]) => event === "display_error")).toBe(true);
  const observer = client();
  await join(observer, "display-pending-player", "secret");
  const received = next(socket, "map");
  observer.emit("map", { id: "player-room", owner: "gm" });
  expect(await received).toEqual([{ id: "player-room", owner: "gm" }]);
});

const view = { mapId: "map-1", x: -0.2, y: 0.3, width: 0.5, height: 0.4 };

test("only a followed player's valid current-map views reach cast displays", async () => {
  const { socket: player, token } = await owner("display-follow");
  const other = client();
  await join(other, "display-follow", "secret");
  other.emit("player_state", { userId: "other" });
  const display = client();
  await joinDisplay(display, "display-follow", token);
  const displayEvents = record(display);
  const playerEvents = record(player);
  const otherEvents = record(other);
  other.emit("display_view", view);
  player.emit("display_view", { ...view, mapId: "old-map" });
  for (const invalid of [
    null, [], "view", { ...view, mapId: 1 },
    ...["x", "y", "width", "height"].flatMap((key) =>
      [NaN, Infinity, -Infinity, "1", null, undefined].map((value) => ({ ...view, [key]: value }))),
    { ...view, width: 0 }, { ...view, width: -1 },
    { ...view, height: 0 }, { ...view, height: -1 },
  ]) player.emit("display_view", invalid);
  await displayToken(player);
  await pause();
  expect(displayEvents).toEqual([]);
  player.emit("display_view", view);
  await pause();
  expect(displayEvents).toEqual([["display_view", view]]);
  expect(playerEvents).toEqual([]);
  expect(otherEvents.filter(([event]) => event === "display_view")).toEqual([]);
});

test("freeze holds the shown view for joining displays and unfreeze sends the latest view", async () => {
  const { socket: player, token } = await owner("display-freeze");
  const display = client();
  await joinDisplay(display, "display-freeze", token);
  const other = client();
  const joinEvents = record(other);
  await join(other, "display-freeze", "secret");
  expect(joinEvents.find(([event]) => event === "display_frozen")).toEqual(["display_frozen", false]);
  other.emit("player_state", { userId: "other" });
  await displayToken(other);
  await pause();
  const events = record(display);
  const playerEvents = record(player);
  other.emit("display_freeze", true);
  player.emit("display_freeze", "true");
  await displayToken(player);
  await pause();
  expect(events).toEqual([]);
  player.emit("display_view", view);
  player.emit("display_freeze", true);
  player.emit("display_freeze", true);
  const latest = { ...view, x: 0.8 };
  player.emit("display_view", latest);
  await displayToken(player);
  await pause();
  expect(events).toEqual([["display_view", view], ["display_frozen", true]]);
  expect(playerEvents).toEqual([["display_frozen", true]]);
  expect(joinEvents.filter(([event]) => event === "display_frozen")).toEqual([
    ["display_frozen", false], ["display_frozen", true],
  ]);
  const lateDisplay = client();
  const lateEvents = record(lateDisplay);
  await joinDisplay(lateDisplay, "display-freeze", token);
  expect(lateEvents).toEqual([
    ["party_state", expect.any(Object)], ["map_state", undefined],
    ["map", { id: "map-1", owner: "gm" }], ["manifest", undefined],
    ["joined_display", lateDisplay.id, expect.any(String), { room: { name: "display-freeze" } }],
    ["display_frozen", true], ["display_view", view],
  ]);
  player.emit("display_freeze", false);
  await displayToken(player);
  await pause();
  expect(events.slice(-2)).toEqual([["display_frozen", false], ["display_view", latest]]);
  expect(lateEvents.slice(-2)).toEqual([["display_frozen", false], ["display_view", latest]]);
});

test("switching maps through none broadcasts unfreeze only once and forgets unfrozen views", async () => {
  const gameId = "display-map-switch";
  const { socket: player, token } = await owner(gameId);
  const display = client();
  await joinDisplay(display, gameId, token);
  player.emit("display_view", view);
  player.emit("display_freeze", true);
  await displayToken(player);
  await pause();
  const events = record(display);
  const playerEvents = record(player);
  player.emit("map", null);
  player.emit("map", { id: "map-2", owner: "gm" });
  await displayToken(player);
  await pause();
  expect(events.filter(([event]) => event === "display_frozen")).toEqual([["display_frozen", false]]);
  expect(playerEvents).toEqual([["display_frozen", false]]);
  player.emit("display_view", { ...view, mapId: "map-2" });
  await displayToken(player);
  player.emit("map", null);
  player.emit("map", { id: "map-3", owner: "gm" });
  await displayToken(player);
  await pause();
  expect(events.filter(([event]) => event === "display_frozen")).toEqual([["display_frozen", false]]);
  const late = client();
  const lateEvents = record(late);
  await joinDisplay(late, gameId, token);
  expect(lateEvents.filter(([event]) => event === "display_view")).toEqual([]);
});

for (const replacement of [null, { id: "map-2", owner: "gm" }]) {
  test(`changing the map to ${replacement?.id || "none"} forgets views and resets freeze`, async () => {
    const gameId = `display-reset-${replacement?.id || "none"}`;
    const { socket: player, token } = await owner(gameId);
    const display = client();
    await joinDisplay(display, gameId, token);
    player.emit("display_view", view);
    player.emit("display_freeze", true);
    player.emit("display_view", { ...view, x: 0.9 });
    await displayToken(player);
    await pause();
    const events = record(display);
    const playerEvents = record(player);
    player.emit("map", { id: "map-1", owner: "gm", name: "renamed" });
    await displayToken(player);
    await pause();
    expect(events.filter(([event]) => event === "display_frozen")).toEqual([]);
    player.emit("map", replacement);
    await displayToken(player);
    await pause();
    expect(events.filter(([event]) => event === "display_frozen")).toEqual([["display_frozen", false]]);
    expect(playerEvents).toEqual([["display_frozen", false]]);
    // The frontend clears the map before selecting another, including the same id.
    player.emit("map", null);
    player.emit("map", { id: "map-1", owner: "gm" });
    await displayToken(player);
    const late = client();
    const lateEvents = record(late);
    await joinDisplay(late, gameId, token);
    expect(lateEvents.filter(([event]) => event === "display_frozen")).toEqual([["display_frozen", false]]);
    expect(lateEvents.filter(([event]) => event === "display_view")).toEqual([]);
    player.emit("display_freeze", false);
    await displayToken(player);
    await pause();
    expect(lateEvents.filter(([event]) => event === "display_view")).toEqual([]);
    player.emit("display_view", view);
    await displayToken(player);
    await pause();
    expect(lateEvents.filter(([event]) => event === "display_view")).toEqual([["display_view", view]]);
  });
}
