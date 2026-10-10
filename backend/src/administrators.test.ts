import { expect, test } from "bun:test";
import { createRoom, inviteAccount, setupAdministrator, signIn, startTestServer, nextMessage } from "./testing/serverHelpers";

function request(address: string, path: string, method = "GET", cookie = "", body?: unknown) {
  return fetch(`${address}/api/${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const administratorPath = (id: string) => `admin/accounts/${id}/administrator`;

test("an administrator gives and takes the mark and demotion ends administration access immediately", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const other = await inviteAccount(server, admin.cookie, "Other", "test-password");
    const promoted = await request(server.address, administratorPath(other.account.id), "POST", admin.cookie, { administrator: true });
    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toEqual({ account: { ...other.account, administrator: true } });
    expect((await request(server.address, "admin/accounts", "GET", other.cookie)).status).toBe(200);
    const demoted = await request(server.address, administratorPath(other.account.id), "POST", admin.cookie, { administrator: false });
    expect(await demoted.json()).toEqual({ account: other.account });
    expect((await request(server.address, "admin/accounts", "GET", other.cookie)).status).toBe(403);
    await server.restart();
    expect((await request(server.address, "admin/accounts", "GET", other.cookie)).status).toBe(403);
  } finally { await server.dispose(); }
});

test("the last administrator survives simultaneous demotions and cannot remove itself", async () => {
  const server = await startTestServer();
  try {
    const first = await setupAdministrator(server);
    const second = await inviteAccount(server, first.cookie, "Second", "test-password");
    await request(server.address, administratorPath(second.account.id), "POST", first.cookie, { administrator: true });
    const results = await Promise.all([first, second].map(account => request(server.address, administratorPath(account.account.id), "POST", account.cookie, { administrator: false })));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await results.find(result => result.status === 409)!.json() as any).error).toBe("last_administrator");
    const remaining = results[0].status === 409 ? first : second;
    const removed = await request(server.address, `admin/accounts/${remaining.account.id}`, "DELETE", remaining.cookie);
    expect(removed.status).toBe(409);
    expect((await removed.json() as any).error).toBe("cannot_remove_self");
    expect((await request(server.address, "status")).status).toBe(200);
  } finally { await server.dispose(); }
});

test("removing an account ends every HTTP sign-in and passes loaded and unloaded rooms on without changing their contents", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const other = await inviteAccount(server, admin.cookie, "Removed", "test-password");
    const secondSignIn = await signIn(server, "Removed", "test-password");
    const loaded = await createRoom(server, other.cookie, "Loaded", "room-password");
    const unloaded = await createRoom(server, other.cookie, "Unloaded");
    await server.restart();
    const owner = await server.joinRoomAsGM(loaded.id, other.cookie);
    const observer = await server.joinRoom(loaded.id, "room-password");
    const displayToken = await new Promise<string>(resolve => owner.socket.emit("get_display_token", resolve));
    const state = { mapId: "map", notes: { door: "Secret door" } };
    const received = nextMessage(observer.socket, "map_state");
    owner.socket.emit("map_state", state);
    await received;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const upload = await fetch(`${server.address}/assets/image`, { method: "PUT", body: png, headers: {
      Authorization: `Bearer ${owner.token}`, "Content-Type": "image/png", "X-Asset-Width": "4", "X-Asset-Height": "2", "X-Asset-Owner": "gm",
    } });
    expect(upload.status).toBe(201);
    await upload.text();
    const removed = await request(server.address, `admin/accounts/${other.account.id}`, "DELETE", admin.cookie);
    expect(removed.status).toBe(204);
    expect(await removed.text()).toBe("");
    for (const cookie of [other.cookie, secondSignIn.cookie]) {
      const refused = await request(server.address, "rooms", "GET", cookie);
      expect(refused.status).toBe(401);
      expect((await refused.json() as any).error).toBe("not_signed_in");
    }
    const invalid = await request(server.address, "sign-in", "POST", "", { username: "Removed", password: "test-password" });
    expect(invalid.status).toBe(401);
    expect((await invalid.json() as any).error).toBe("invalid_credentials");
    // Sizes grow with what the room keeps, which is not what moves here
    const rooms = async () => ((await (await request(server.address, "rooms", "GET", admin.cookie)).json() as any).rooms as any[]).map(({ id, name, hasPassword }) => ({ id, name, hasPassword }));
    const expected = [loaded, unloaded].map(({ id, name, hasPassword }) => ({ id, name, hasPassword }));
    expect(await rooms()).toEqual(expected);
    const rename = await request(server.address, `rooms/${loaded.id}`, "PATCH", admin.cookie, { name: "Loaded" });
    expect(rename.status).toBe(200);
    await server.clock.advance(3000);
    await server.restart();
    expect(await rooms()).toEqual(expected);
    expect((await request(server.address, "rooms", "GET", other.cookie)).status).toBe(401);
    const rejoined = await server.joinRoom(loaded.id, "room-password");
    expect(rejoined.state.mapState).toEqual(state);
    expect(await new Promise<string>(resolve => rejoined.socket.emit("get_display_token", resolve))).toBe(displayToken);
    const image = await fetch(`${server.address}/assets/image`, { headers: { Authorization: `Bearer ${rejoined.token}` } });
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
    expect((await (await request(server.address, "admin/accounts", "GET", admin.cookie)).json() as any).accounts).toEqual([admin.account]);
  } finally { await server.dispose(); }
});

test("administration changes require an administrator, an allowed origin and an existing account", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const other = await inviteAccount(server, admin.cookie, "Ordinary", "test-password");
    for (const [path, method, body] of [[administratorPath(other.account.id), "POST", { administrator: true }], [`admin/accounts/${other.account.id}`, "DELETE", undefined]] as const) {
      for (const [cookie, status, error] of [["", 401, "not_signed_in"], [other.cookie, 403, "not_administrator"]] as const) {
        const refused = await request(server.address, path, method, cookie, body);
        expect(refused.status).toBe(status);
        expect((await refused.json() as any).error).toBe(error);
      }
      const foreign = await fetch(`${server.address}/api/${path}`, { method, headers: { Cookie: admin.cookie, Origin: "https://foreign.example" } });
      expect(foreign.status).toBe(403);
      expect((await foreign.json() as any).error).toBe("origin_not_allowed");
      const missing = await request(server.address, path.replace(other.account.id, "missing"), method, admin.cookie, body);
      expect(missing.status).toBe(404);
      expect((await missing.json() as any).error).toBe("account_not_found");
    }
  } finally { await server.dispose(); }
});

test("simultaneous removal and demotion keep an administrator and refuse self removal even with another administrator", async () => {
  const server = await startTestServer();
  try {
    const first = await setupAdministrator(server);
    const second = await inviteAccount(server, first.cookie, "Second", "test-password");
    await request(server.address, administratorPath(second.account.id), "POST", first.cookie, { administrator: true });
    expect((await request(server.address, `admin/accounts/${first.account.id}`, "DELETE", first.cookie)).status).toBe(409);
    const results = await Promise.all([
      request(server.address, `admin/accounts/${second.account.id}`, "DELETE", first.cookie),
      request(server.address, administratorPath(first.account.id), "POST", second.cookie, { administrator: false }),
    ]);
    expect(results.filter(response => response.status >= 200 && response.status < 300)).toHaveLength(1);
    const status = await (await request(server.address, "status")).json() as any;
    expect(status.setup).toBe("closed");
    const cookie = results[0].status === 204 ? first.cookie : second.cookie;
    const accounts = (await (await request(server.address, "admin/accounts", "GET", cookie)).json() as any).accounts;
    expect(accounts.filter((account: any) => account.administrator)).toHaveLength(1);
  } finally { await server.dispose(); }
});

test("an administrator mark must be a boolean and invalid requests leave the account unchanged", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    for (const administrator of [undefined, null, 0, 1, "false", "true"]) {
      const response = await request(server.address, administratorPath(admin.account.id), "POST", admin.cookie, { administrator });
      expect(response.status).toBe(400);
      expect((await response.json() as any).error).toBe("administrator_invalid");
    }
    const malformed = await fetch(`${server.address}/api/${administratorPath(admin.account.id)}`, { method: "POST", headers: { Cookie: admin.cookie, "Content-Type": "application/json" }, body: "{" });
    expect(malformed.status).toBe(400);
    expect((await malformed.json() as any).error).toBe("administrator_invalid");
    expect((await (await request(server.address, "status", "GET", admin.cookie)).json() as any).account).toEqual(admin.account);
  } finally { await server.dispose(); }
});
