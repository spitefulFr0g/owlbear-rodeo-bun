import { io, Socket } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";
import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

function post(address: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${address}/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

test("only an enabled proxy can make setup and sign-in cookies Secure for HTTPS", async () => {
  const server = await startTestServer();
  try {
    const setup = await post(server.address, "setup", { username: "Administrator", password: "test-password" }, { "X-Forwarded-Proto": "https" });
    expect(setup.status).toBe(201);
    expect(setup.headers.get("set-cookie")).not.toContain("Secure");
    const directSignIn = await post(server.address, "sign-in", { username: "Administrator", password: "test-password" }, { "X-Forwarded-Proto": "https" });
    expect(directSignIn.status).toBe(200);
    expect(directSignIn.headers.get("set-cookie")).not.toContain("Secure");
    await server.restart({ behindProxy: true });
    for (const protocol of ["https", "http", "https, http", "http, https", ""]) {
      const response = await post(server.address, "sign-in", { username: "Administrator", password: "test-password" }, { "X-Forwarded-Proto": protocol });
      expect(response.status).toBe(200);
      const cookie = response.headers.get("set-cookie")!;
      for (const flag of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) expect(cookie).toContain(flag);
      expect(cookie.includes("Secure")).toBe(protocol === "https" || protocol === "http, https");
    }
  } finally { await server.dispose(); }
});

for (const behindProxy of [false, true]) test(`sign-in address limits ${behindProxy ? "use the nearest proxy address" : "ignore forwarded addresses"}`, async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    await server.restart({ behindProxy });
    for (let i = 0; i < 5; i++) {
      const response = await post(server.address, "sign-in", { username: `Unknown${i}`, password: "wrong" }, { "X-Forwarded-For": `198.51.100.${i + 1}, 203.0.113.1` });
      expect(response.status).toBe(401);
    }
    const sameVisitor = await post(server.address, "sign-in", { username: "Administrator", password: "test-password" }, { "X-Forwarded-For": "198.51.100.99, 203.0.113.1" });
    expect(sameVisitor.status).toBe(429);
    expect((await sameVisitor.json() as any).retryAfterSeconds).toBe(300);
    const otherVisitor = await post(server.address, "sign-in", { username: "Administrator", password: "test-password" }, { "X-Forwarded-For": "203.0.113.2" });
    expect(otherVisitor.status).toBe(behindProxy ? 200 : 429);
  } finally { await server.dispose(); }
});

for (const behindProxy of [false, true]) test(`room address limits ${behindProxy ? "use the nearest proxy address" : "ignore forwarded addresses"}`, async () => {
  const server = await startTestServer();
  const sockets: Socket[] = [];
  const connect = (address: string) => {
    const socket = io(server.address, { parser: msgParser, transports: ["websocket"], reconnection: false, extraHeaders: { "X-Forwarded-For": address, "X-Forwarded-Proto": "https" } });
    sockets.push(socket);
    return socket;
  };
  const join = (socket: Socket, room: string, password: string, event: string) => {
    const answer = nextMessage(socket, event);
    socket.emit("join_game", room, password);
    return answer;
  };
  try {
    const { cookie } = await setupAdministrator(server);
    const rooms = [];
    for (let i = 0; i < 6; i++) rooms.push(await createRoom(server, cookie, `Room ${i}`, "secret"));
    await server.restart({ behindProxy });
    for (let i = 0; i < 5; i++) await join(connect(`198.51.100.${i + 1}, 203.0.113.1`), rooms[i].id, "wrong", "auth_error");
    expect(await join(connect("198.51.100.99, 203.0.113.1"), rooms[5].id, "secret", "auth_wait")).toEqual([300]);
    await join(connect("203.0.113.2"), rooms[5].id, "secret", behindProxy ? "joined_game" : "auth_wait");
  } finally { for (const socket of sockets) socket.disconnect(); await server.dispose(); }
});

test("proxy HTTPS setup, cookie renewal, sign-out and room joining keep working", async () => {
  const server = await startTestServer();
  try {
    await server.restart({ behindProxy: true });
    const headers = { "X-Forwarded-Proto": "https", "X-Forwarded-For": "203.0.113.1" };
    const setup = await post(server.address, "setup", { username: "Administrator", password: "test-password" }, headers);
    expect(setup.status).toBe(201);
    expect(setup.headers.get("set-cookie")).toContain("Secure");
    const signedIn = await post(server.address, "sign-in", { username: "Administrator", password: "test-password" }, headers);
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers.get("set-cookie")!.split(";")[0];
    await server.clock.advance(24 * 60 * 60 * 1000);
    const renewed = await fetch(`${server.address}/api/status`, { headers: { ...headers, Cookie: cookie } });
    expect((await renewed.json() as any).account.username).toBe("Administrator");
    expect(renewed.headers.get("set-cookie")).toContain("Secure");
    const created = await post(server.address, "rooms", { name: "Proxied room", password: "secret" }, { ...headers, Cookie: cookie });
    expect(created.status).toBe(201);
    const { room } = await created.json() as any;
    const socket = io(server.address, { parser: msgParser, transports: ["websocket"], reconnection: false, extraHeaders: headers });
    try {
      const joined = nextMessage(socket, "joined_game");
      socket.emit("join_game", room.id, "secret");
      expect((await joined)[1]).toBeString();
    } finally { socket.disconnect(); }
    const signedOut = await post(server.address, "sign-out", {}, { ...headers, Cookie: cookie });
    expect(signedOut.status).toBe(204);
    expect(signedOut.headers.get("set-cookie")).toContain("Secure");
  } finally { await server.dispose(); }
});
