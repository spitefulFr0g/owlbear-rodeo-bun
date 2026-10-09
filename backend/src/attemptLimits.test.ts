import { expect, test } from "bun:test";
import { setupAdministrator, startTestServer } from "./testing/serverHelpers";

const MINUTE = 60_000;
function attempt(address: string, username = "Administrator", password = "wrong") {
  return fetch(`${address}/api/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
}
async function wrongFive(address: string) {
  for (let i = 0; i < 5; i++) expect((await attempt(address)).status).toBe(401);
}
test("five wrong sign-ins refuse even the right password for five minutes with a rounded wait", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    await wrongFive(server.address);
    let response = await attempt(server.address, "administrator", "test-password");
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too_many_attempts", message: "Too many incorrect passwords; please wait before trying again.", retryAfterSeconds: 300 });
    await server.clock.advance(299_001);
    response = await attempt(server.address, "ADMINISTRATOR", "test-password");
    expect((await response.json() as any).retryAfterSeconds).toBe(1);
    await server.clock.advance(999);
    expect((await attempt(server.address, "Administrator", "test-password")).status).toBe(200);
  } finally { await server.dispose(); }
});

test("later address refusals last fifteen minutes across unknown names and forwarded headers cannot bypass them", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 5; i++) expect((await attempt(server.address, `Unknown${round}-${i}`)).status).toBe(401);
      const response = await fetch(`${server.address}/api/sign-in`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${round}` }, body: JSON.stringify({ username: "Administrator", password: "test-password" }) });
      expect(response.status).toBe(429);
      expect((await response.json() as any).retryAfterSeconds).toBe(round === 0 ? 300 : 900);
      await server.clock.advance((round === 0 ? 5 : 15) * MINUTE - 1);
      expect((await attempt(server.address)).status).toBe(429);
      await server.clock.advance(1);
    }
  } finally { await server.dispose(); }
});

import { Agent, request } from "http";
function fromAddress(server: { address: string }, source: string, username = "Administrator", password = "wrong"): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/sign-in", server.address);
    url.hostname = "127.0.0.1";
    const req = request(url, { method: "POST", localAddress: source, headers: { "Content-Type": "application/json" } }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode!, body: JSON.parse(body) }));
    });
    req.on("error", reject);
    req.end(JSON.stringify({ username, password }));
  });
}

test("account names share a count across capitals and addresses, including unknown names", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    for (const name of ["Administrator", "Missing"]) {
      for (let i = 0; i < 5; i++) expect((await fromAddress(server, `127.0.0.${i + 2}`, i % 2 ? name.toUpperCase() : name)).status).toBe(401);
      const refused = await fromAddress(server, "127.0.0.20", name.toLowerCase(), "test-password");
      expect(refused.status).toBe(429);
      expect(refused.body.retryAfterSeconds).toBe(300);
    }
    expect((await fromAddress(server, "127.0.0.20", "Other")).status).toBe(401);
  } finally { await server.dispose(); }
});

test("successful sign-in resets only the account count and its refusal history", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    for (let i = 0; i < 5; i++) await fromAddress(server, `127.0.0.${i + 2}`);
    await server.clock.advance(5 * MINUTE);
    expect((await fromAddress(server, "127.0.0.20", "administrator", "test-password")).status).toBe(200);
    for (let i = 0; i < 4; i++) await fromAddress(server, `127.0.0.${i + 30}`);
    expect((await fromAddress(server, "127.0.0.40", "Administrator", "test-password")).status).toBe(200);
    for (let i = 0; i < 5; i++) await fromAddress(server, `127.0.0.${i + 50}`);
    expect((await fromAddress(server, "127.0.0.60")).body.retryAfterSeconds).toBe(300);
    for (let i = 0; i < 5; i++) await fromAddress(server, "127.0.0.70", `Missing${i}`);
    await server.clock.advance(5 * MINUTE);
    expect((await fromAddress(server, "127.0.0.70", "Administrator", "test-password")).status).toBe(200);
    for (let i = 0; i < 5; i++) await fromAddress(server, "127.0.0.70", `Other${i}`);
    expect((await fromAddress(server, "127.0.0.70")).body.retryAfterSeconds).toBe(900);
  } finally { await server.dispose(); }
});

test("wrong attempts expire at fifteen minutes and all counts reset at twenty-four hours without a wrong attempt", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    for (let i = 0; i < 4; i++) await attempt(server.address);
    await server.clock.advance(15 * MINUTE);
    expect((await attempt(server.address)).status).toBe(401);
    expect((await attempt(server.address, "Administrator", "test-password")).status).toBe(200);
    await server.clock.advance(24 * 60 * MINUTE);
    await wrongFive(server.address);
    await server.clock.advance(24 * 60 * MINUTE - 1);
    // A successful sign-in resets the name, but must not reset the address history.
    expect((await attempt(server.address, "Administrator", "test-password")).status).toBe(200);
    await server.clock.advance(1);
    await wrongFive(server.address);
    expect((await attempt(server.address)).status).toBe(429);
    expect((await (await attempt(server.address)).json() as any).retryAfterSeconds).toBe(300);
  } finally { await server.dispose(); }
});

import { nextMessage } from "./testing/serverHelpers";
test("room refusal tells only the joiner to wait and leaves existing players joined", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    const resident = await server.joinRoom("room", "secret");
    const socket = server.connect();
    const residentEvents: string[] = [];
    const joinerEvents: string[] = [];
    resident.socket.on("auth_wait", () => residentEvents.push("auth_wait"));
    resident.socket.on("joined_game", () => residentEvents.push("joined_game"));
    socket.on("joined_game", () => joinerEvents.push("joined_game"));
    socket.on("map", () => joinerEvents.push("map"));
    for (let i = 0; i < 5; i++) {
      const error = nextMessage(socket, "auth_error");
      socket.emit("join_game", "room", "wrong");
      await error;
    }
    const wait = nextMessage(socket, "auth_wait");
    socket.emit("join_game", "room", "secret");
    expect(await wait).toEqual([300]);
    expect(resident.socket.connected).toBe(true);
    expect(residentEvents).toEqual([]);
    expect(joinerEvents).toEqual([]);
    await server.clock.advance(5 * MINUTE);
    const joined = nextMessage(socket, "joined_game");
    socket.emit("join_game", "room", "secret");
    expect((await joined)[1]).toBeString();
  } finally { await server.dispose(); }
});

import { io, Socket } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";
function roomSocket(server: { address: string }, source: string) {
  return io(server.address.replace("localhost", "127.0.0.1"), {
    parser: msgParser, transports: ["polling"], reconnection: false,
    transportOptions: { polling: { agent: new Agent({ localAddress: source }) } },
  });
}
async function joinAnswer(socket: Socket, room: string, password: string, event: string) {
  const answer = nextMessage(socket, event);
  socket.emit("join_game", room, password);
  return answer;
}

test("room counts span addresses while address counts span rooms with later refusals of fifteen minutes", async () => {
  const server = await startTestServer();
  const sockets: Socket[] = [];
  const connect = (source: string) => { const socket = roomSocket(server, source); sockets.push(socket); return socket; };
  try {
    await setupAdministrator(server);
    for (let i = 0; i < 5; i++) await server.joinRoom(`room${i}`, "secret");
    for (let i = 0; i < 5; i++) await joinAnswer(connect(`127.0.0.${i + 2}`), "room0", "wrong", "auth_error");
    expect(await joinAnswer(connect("127.0.0.20"), "room0", "secret", "auth_wait")).toEqual([300]);
    // This address has not failed; another room remains accessible.
    await joinAnswer(connect("127.0.0.20"), "room1", "secret", "joined_game");
    const attacker = connect("127.0.0.30");
    for (let i = 0; i < 5; i++) await joinAnswer(attacker, `room${i === 0 ? 1 : i}`, "wrong", "auth_error");
    expect(await joinAnswer(attacker, "room2", "secret", "auth_wait")).toEqual([300]);
    await server.clock.advance(5 * MINUTE - 1);
    expect(await joinAnswer(attacker, "room2", "secret", "auth_wait")).toEqual([1]);
    await server.clock.advance(1);
    for (let i = 0; i < 5; i++) await joinAnswer(attacker, `room${i}`, "wrong", "auth_error");
    expect(await joinAnswer(attacker, "room4", "secret", "auth_wait")).toEqual([900]);
    await server.clock.advance(15 * MINUTE - 1);
    expect(await joinAnswer(attacker, "room4", "secret", "auth_wait")).toEqual([1]);
    await server.clock.advance(1);
    await joinAnswer(attacker, "room4", "secret", "joined_game");
  } finally { for (const socket of sockets) socket.disconnect(); await server.dispose(); }
});

test("room attempts expire after fifteen minutes and room and address histories reset after twenty-four hours", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    await server.joinRoom("room", "secret");
    const socket = server.connect();
    for (let i = 0; i < 4; i++) await joinAnswer(socket, "room", "wrong", "auth_error");
    await server.clock.advance(15 * MINUTE);
    await joinAnswer(socket, "room", "wrong", "auth_error");
    // Four more failures now reach five, rather than refusing at the first one.
    for (let i = 0; i < 4; i++) await joinAnswer(socket, "room", "wrong", "auth_error");
    expect(await joinAnswer(socket, "room", "secret", "auth_wait")).toEqual([300]);
    await server.clock.advance(24 * 60 * MINUTE);
    for (let i = 0; i < 5; i++) await joinAnswer(socket, "room", "wrong", "auth_error");
    expect(await joinAnswer(socket, "room", "secret", "auth_wait")).toEqual([300]);
  } finally { await server.dispose(); }
});

test("an account count resets after exactly twenty-four hours without a wrong attempt", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    for (let i = 0; i < 5; i++) await fromAddress(server, `127.0.0.${i + 2}`);
    await server.clock.advance(24 * 60 * MINUTE);
    for (let i = 0; i < 5; i++) await fromAddress(server, `127.0.0.${i + 20}`);
    expect((await fromAddress(server, "127.0.0.40")).body.retryAfterSeconds).toBe(300);
  } finally { await server.dispose(); }
});

test("a restart clears account, room and address counts and sign-in counts are separate from room counts", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    await server.joinRoom("room", "secret");
    await wrongFive(server.address);
    // Sign-in address refusal does not refuse room joins.
    await server.joinRoom("room", "secret");
    const socket = server.connect();
    for (let i = 0; i < 5; i++) await joinAnswer(socket, "room", "wrong", "auth_error");
    expect(await joinAnswer(socket, "room", "secret", "auth_wait")).toEqual([300]);
    await server.restart();
    expect((await attempt(server.address, "Administrator", "test-password")).status).toBe(200);
    await server.joinRoom("room", "secret");
    await wrongFive(server.address);
    expect((await (await attempt(server.address)).json() as any).retryAfterSeconds).toBe(300);
    const fresh = server.connect();
    for (let i = 0; i < 5; i++) await joinAnswer(fresh, "room", "wrong", "auth_error");
    expect(await joinAnswer(fresh, "room", "secret", "auth_wait")).toEqual([300]);
  } finally { await server.dispose(); }
});

test("a room's second and later refusals last fifteen minutes and a successful join does not reset its count", async () => {
  const server = await startTestServer();
  const sockets: Socket[] = [];
  const connect = (source: number) => { const socket = roomSocket(server, `127.0.0.${source}`); sockets.push(socket); return socket; };
  try {
    await setupAdministrator(server);
    await server.joinRoom("room", "secret");
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 5; i++) await joinAnswer(connect(2 + round * 10 + i), "room", "wrong", "auth_error");
      expect(await joinAnswer(connect(60 + round), "room", "secret", "auth_wait")).toEqual([round === 0 ? 300 : 900]);
      await server.clock.advance((round === 0 ? 5 : 15) * MINUTE);
      await joinAnswer(connect(70 + round), "room", "secret", "joined_game");
    }
  } finally { for (const socket of sockets) socket.disconnect(); await server.dispose(); }
});

test("opening a password room without a password is asked for it and never counted as a wrong one", async () => {
  const server = await startTestServer();
  const sockets: Socket[] = [];
  const connect = (source: number) => { const socket = roomSocket(server, `127.0.0.${source}`); sockets.push(socket); return socket; };
  try {
    await setupAdministrator(server);
    await server.joinRoom("room", "secret");
    for (let i = 0; i < 12; i++) await joinAnswer(connect(2 + i), "room", "", "auth_error");
    await joinAnswer(connect(40), "room", "secret", "joined_game");
  } finally { for (const socket of sockets) socket.disconnect(); await server.dispose(); }
});
