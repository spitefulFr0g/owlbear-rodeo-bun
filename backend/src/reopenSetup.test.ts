import { expect, test } from "bun:test";
import { parseConfig } from "./config";
import { createRoom, nextMessage, signIn, setupAdministrator, startTestServer } from "./testing/serverHelpers";

function setup(address: string, username: string, password = "long-password") {
  return fetch(`${address}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
}

test("reopened setup creates one new administrator and only reopens on a flagged restart", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    await server.restart({ reopenSetup: true });
    expect(await (await fetch(`${server.address}/api/status`)).json()).toEqual({ setup: "open", account: null });
    const response = await setup(server.address, "Recovered.GM");
    expect(response.status).toBe(201);
    const { account } = await response.json() as { account: import("./accounts/Accounts").Account };
    expect(account).toEqual({ id: expect.any(String), username: "Recovered.GM", administrator: true });
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    expect(await (await fetch(`${server.address}/api/status`, { headers: { Cookie: cookie } })).json()).toEqual({ setup: "closed", account });
    expect((await setup(server.address, "Another.GM")).status).toBe(409);
    await server.restart();
    expect((await (await fetch(`${server.address}/api/status`)).json() as { setup: string }).setup).toBe("closed");
    expect((await setup(server.address, "Another.GM")).status).toBe(409);
    await server.restart({ reopenSetup: true });
    expect((await setup(server.address, "Another.GM")).status).toBe(201);
  } finally { await server.dispose(); }
});

test("reopened setup validates names and passwords without consuming its one use", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    await server.restart({ reopenSetup: true });
    for (const [username, password, status, error] of [
      ["ab", "long-password", 400, "username_length"],
      ["a".repeat(33), "long-password", 400, "username_length"],
      ["bad name", "long-password", 400, "username_characters"],
      ["New.GM", "short", 400, "password_too_short"],
      ["aDMINISTRATOR", "long-password", 409, "username_taken"],
    ] as const) {
      const response = await setup(server.address, username, password);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error, message: expect.any(String) });
      expect((await (await fetch(`${server.address}/api/status`)).json() as { setup: string }).setup).toBe("open");
    }
    expect((await setup(server.address, "A_1", "12345678")).status).toBe(201);
  } finally { await server.dispose(); }
});

test("reopened setup preserves accounts, signed-in browsers, rooms and images while joins keep working", async () => {
  const server = await startTestServer();
  try {
    const original = await setupAdministrator(server);
    const room = await createRoom(server, original.cookie, "Kept room", "room-password");
    const owner = await server.joinRoomAsGM(room.id, original.cookie);
    await new Promise(resolve => owner.socket.emit("session", true, resolve));
    const observer = await server.joinRoom(room.id, "room-password");
    const map = { id: "kept-map", owner: "gm", type: "file", file: "kept-image" };
    const received = nextMessage(observer.socket, "map");
    owner.socket.emit("map", map);
    await received;
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    expect((await fetch(`${server.address}/assets/kept-image`, { method: "PUT", body: image,
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "image/png", "X-Asset-Width": "4", "X-Asset-Height": "2", "X-Asset-Owner": "gm" } })).status).toBe(201);
    await server.restart({ reopenSetup: true });
    expect(await (await fetch(`${server.address}/api/status`, { headers: { Cookie: original.cookie } })).json()).toEqual({ setup: "open", account: original.account });
    expect((await signIn(server, "administrator", "test-password")).account).toEqual(original.account);
    const joined = await server.joinRoomAsGM(room.id, original.cookie);
    expect(joined.state.map).toEqual(map);
    const download = await fetch(`${server.address}/assets/kept-image`, { headers: { Authorization: `Bearer ${joined.token}` } });
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(image);
    await setupAdministrator(server, "Recovered");
    await server.restart();
    expect((await signIn(server, "Administrator", "test-password")).account).toEqual(original.account);
    expect((await signIn(server, "Recovered", "test-password")).account.administrator).toBe(true);
    const kept = await server.joinRoomAsGM(room.id, original.cookie);
    expect(kept.state.map).toEqual(map);
    expect(new Uint8Array(await (await fetch(`${server.address}/assets/kept-image`, { headers: { Authorization: `Bearer ${kept.token}` } })).arrayBuffer())).toEqual(image);
  } finally { await server.dispose(); }
});

test("simultaneous reopened setup requests create only one administrator", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    await server.restart({ reopenSetup: true });
    const responses = await Promise.all([setup(server.address, "First"), setup(server.address, "Second")]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(await responses.find(response => response.status === 409)!.json()).toEqual({ error: "setup_closed", message: expect.any(String) });
  } finally { await server.dispose(); }
});

test("reopened setup warns at start and reports the created administrator", async () => {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = console.warn = (...args: unknown[]) => { lines.push(args.join(" ")); };
  let server: Awaited<ReturnType<typeof startTestServer>> | undefined;
  try {
    server = await startTestServer();
    await setupAdministrator(server);
    lines.length = 0;
    await server.restart({ reopenSetup: true });
    expect(lines).toContain("Warning: setup is open; the next visitor can create one new administrator.");
    expect(lines).not.toContain("An administrator exists; setup is closed.");
    await setupAdministrator(server, "Recovered");
    expect(lines).toContain("Administrator created: Recovered");
  } finally { console.log = originalLog; console.warn = originalWarn; await server?.dispose(); }
});

test("environment settings cannot reopen setup through server startup", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    await server.restart({ reopenSetup: parseConfig([], { REOPEN_SETUP: "true", OWLBEAR_REOPEN_SETUP: "1" }).reopenSetup });
    expect(await (await fetch(`${server.address}/api/status`)).json()).toEqual({ setup: "closed", account: null });
    const refused = await setup(server.address, "Recovered");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "setup_closed", message: expect.any(String) });
    await server.restart({ reopenSetup: parseConfig(["--reopen-setup"], {}).reopenSetup });
    expect((await setup(server.address, "Recovered")).status).toBe(201);
  } finally { await server.dispose(); }
});
