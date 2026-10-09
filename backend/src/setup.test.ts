import { expect, test } from "bun:test";
import { io } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { startServer } from "./server";
import { createRoom, nextMessage, TestClock, startTestServer } from "./testing/serverHelpers";

test("a new server reports that setup is required without an account", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.address}/api/status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ setup: "required", account: null });
  } finally { await server.dispose(); }
});

function setup(address: string, username = "First.GM", password = "long-password") {
  return fetch(`${address}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
}

test("setup creates one administrator, signs in the browser and survives a restart", async () => {
  const server = await startTestServer();
  try {
    const response = await setup(server.address);
    expect(response.status).toBe(201);
    const { account } = await response.json() as { account: import("./accounts/Accounts").Account };
    expect(account).toEqual({ id: expect.any(String), username: "First.GM", administrator: true });
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("owlbear_sign_in=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).not.toContain("Secure");
    await server.restart();
    const status = await fetch(`${server.address}/api/status`, { headers: { Cookie: cookie.split(";")[0] } });
    expect(await status.json()).toEqual({ setup: "closed", account });
    const refused = await setup(server.address);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "setup_closed", message: expect.any(String) });
  } finally { await server.dispose(); }
});

test("setup refuses invalid usernames and short passwords with readable errors", async () => {
  const server = await startTestServer();
  try {
    for (const [username, password, error] of [
      ["ab", "long-password", "username_length"],
      ["a".repeat(33), "long-password", "username_length"],
      ["bad name", "long-password", "username_characters"],
      ["Good_Name-1", "short", "password_too_short"],
    ]) {
      const response = await setup(server.address, username, password);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error, message: expect.any(String) });
    }
    expect((await setup(server.address, "Good_Name-1")).status).toBe(201);
  } finally { await server.dispose(); }
});

test("simultaneous setup requests create exactly one administrator", async () => {
  const server = await startTestServer();
  try {
    const responses = await Promise.all([setup(server.address, "First"), setup(server.address, "Second")]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const winner = responses.find(response => response.status === 201)!;
    const { account } = await winner.json() as { account: import("./accounts/Accounts").Account };
    const cookie = winner.headers.get("set-cookie")!.split(";")[0];
    expect(await (await fetch(`${server.address}/api/status`, { headers: { Cookie: cookie } })).json()).toEqual({ setup: "closed", account });
  } finally { await server.dispose(); }
});

test("all changing API requests reject foreign origins before and after setup", async () => {
  const server = await startTestServer();
  try {
    for (const path of ["setup", "future-route"]) {
      const response = await fetch(`${server.address}/api/${path}`, { method: "POST", headers: { Origin: "https://foreign.example", "Content-Type": "application/json" }, body: JSON.stringify({ username: "First", password: "long-password" }) });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "origin_not_allowed", message: expect.any(String) });
    }
    expect((await setup(server.address)).status).toBe(201);
    for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
      const response = await fetch(`${server.address}/api/future-route`, { method, headers: { Origin: "https://foreign.example" } });
      expect(response.status).toBe(403);
      expect((await response.json() as { error: string }).error).toBe("origin_not_allowed");
    }
  } finally { await server.dispose(); }
});

test("the locked server refuses assets and other routes while health still answers", async () => {
  const server = await startTestServer();
  try {
    for (const [path, method] of [["/assets/image", "GET"], ["/assets/image", "PUT"], ["/api/rooms", "GET"], ["/api/setup", "GET"], ["/unknown.txt", "GET"], ["/unknown", "POST"]]) {
      const response = await fetch(`${server.address}${path}`, { method });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "setup_required", message: expect.any(String) });
    }
    expect((await fetch(`${server.address}/health`)).status).toBe(200);
  } finally { await server.dispose(); }
});

test("the locked server refuses room and cast display joins without joining", async () => {
  const server = await startTestServer();
  const socket = io(server.address, { parser: msgParser, transports: ["websocket"], reconnection: false });
  try {
    let joined = false;
    socket.on("joined_game", () => { joined = true; });
    socket.on("joined_display", () => { joined = true; });
    for (const event of ["join_game", "join_display"]) {
      const refused = nextMessage(socket, "setup_required");
      socket.emit(event, "room", "");
      await refused;
      expect(joined).toBe(false);
    }
    const response = await setup(server.address);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const room = await createRoom(server, cookie, "Room");
    const accepted = nextMessage(socket, "joined_game");
    socket.emit("join_game", room.id, "");
    await accepted;
    expect(joined).toBe(true);
  } finally { socket.disconnect(); await server.dispose(); }
});

test("the console reports whether an administrator exists and when setup creates one", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };
  let server: Awaited<ReturnType<typeof startTestServer>> | undefined;
  try {
    server = await startTestServer();
    expect(lines).toContain("No administrator exists; setup is required.");
    await setup(server.address);
    expect(lines).toContain("Administrator created: First.GM");
    await server.restart();
    expect(lines).toContain("An administrator exists; setup is closed.");
  } finally { console.log = original; await server?.dispose(); }
});

test("the lock also refuses asset and API preflight requests", async () => {
  const server = await startTestServer();
  try {
    for (const path of ["/assets/image", "/api/rooms"]) {
      const response = await fetch(`${server.address}${path}`, { method: "OPTIONS", headers: { Origin: server.address, "Access-Control-Request-Method": "PUT" } });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "setup_required", message: expect.any(String) });
    }
  } finally { await server.dispose(); }
});

test("malformed setup JSON is refused with a readable JSON error", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.address}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "username_length", message: expect.any(String) });
  } finally { await server.dispose(); }
});

test("an allowed extra origin can set up the server with credentialed CORS", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "owlbear-cors-"));
  const server = await startServer({ dataDir, port: 0, allowOrigin: /^http:\/\/localhost:3000$/, clock: new TestClock() });
  try {
    const headers = { Origin: "http://localhost:3000" };
    const preflight = await fetch(`${server.address}/api/setup`, { method: "OPTIONS", headers: { ...headers, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
    const response = await fetch(`${server.address}/api/setup`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ username: "Dev_GM", password: "long-password" }) });
    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const status = await fetch(`${server.address}/api/status`, { headers: { ...headers, Cookie: cookie } });
    expect(await status.json()).toEqual({ setup: "closed", account: { id: expect.any(String), username: "Dev_GM", administrator: true } });
  } finally { await server.stop(); await rm(dataDir, { recursive: true, force: true }); }
});

test("status treats an unknown or altered sign-in cookie as signed out", async () => {
  const server = await startTestServer();
  try {
    const response = await setup(server.address);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    for (const value of ["owlbear_sign_in=unknown", `${cookie}altered`]) {
      const status = await fetch(`${server.address}/api/status`, { headers: { Cookie: value } });
      expect(await status.json()).toEqual({ setup: "closed", account: null });
    }
  } finally { await server.dispose(); }
});

test("setup accepts a 32 character username and an eight character password", async () => {
  const server = await startTestServer();
  try {
    const username = "a".repeat(32);
    const response = await setup(server.address, username, "12345678");
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ account: { id: expect.any(String), username, administrator: true } });
  } finally { await server.dispose(); }
});
