import { expect, test } from "bun:test";
import { inviteAccount, setupAdministrator, signIn, startTestServer } from "./testing/serverHelpers";

function request(address: string, path: string, method = "GET", cookie = "", body?: unknown) {
  return fetch(`${address}/api/${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("only an administrator can make a reset link for an existing account", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const ordinary = await inviteAccount(server, admin.cookie, "Player", "test-password");
    const path = `admin/accounts/${ordinary.account.id}/reset-link`;
    for (const [cookie, status, error] of [["", 401, "not_signed_in"], [ordinary.cookie, 403, "not_administrator"], [admin.cookie, 201, undefined]] as const) {
      const response = await request(server.address, path, "POST", cookie);
      expect(response.status).toBe(status);
      const body = await response.json() as any;
      if (error) expect(body).toEqual({ error, message: expect.any(String) });
      else {
        expect(body.token).toMatch(/^[a-f0-9]{64}$/);
        expect(body.expiresAt).toBe(Date.UTC(2026, 0, 8));
        expect(await (await request(server.address, `resets/${body.token}`)).json()).toEqual({ username: "Player" });
      }
    }
    const missing = await request(server.address, "admin/accounts/missing/reset-link", "POST", admin.cookie);
    expect(missing.status).toBe(404);
    expect((await missing.json() as any).error).toBe("account_not_found");
  } finally { await server.dispose(); }
});

test("a reset changes the password, ends every earlier sign-in and signs in its browser", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const account = await inviteAccount(server, admin.cookie, "Player", "test-password");
    const second = await signIn(server, "Player", "test-password");
    const { token } = await (await request(server.address, `admin/accounts/${account.account.id}/reset-link`, "POST", admin.cookie)).json() as any;
    const response = await request(server.address, `resets/${token}`, "POST", "", { password: "new-password" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ account: account.account });
    const cookie = response.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) expect(cookie).toContain(flag);
    await server.restart();
    for (const old of [account.cookie, second.cookie]) {
      expect((await (await request(server.address, "status", "GET", old)).json() as any).account).toBeNull();
      expect((await request(server.address, "rooms", "GET", old)).status).toBe(401);
    }
    expect((await (await request(server.address, "status", "GET", cookie.split(";")[0])).json() as any).account).toEqual(account.account);
    expect((await request(server.address, "sign-in", "POST", "", { username: "Player", password: "test-password" })).status).toBe(401);
    expect((await signIn(server, "Player", "new-password")).account).toEqual(account.account);
    expect((await (await request(server.address, "status", "GET", admin.cookie)).json() as any).account).toEqual(admin.account);
  } finally { await server.dispose(); }
});

test("reset validation preserves the link and used, expired or unknown links have one answer", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const make = async () => (await (await request(server.address, `admin/accounts/${admin.account.id}/reset-link`, "POST", admin.cookie)).json() as any).token;
    const token = await make();
    for (const password of ["short", null, 123]) {
      const response = await request(server.address, `resets/${token}`, "POST", "", { password });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "password_too_short", message: "Your password must be at least 8 characters long." });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect((await request(server.address, `resets/${token}`)).status).toBe(200);
    }
    const expired = await make();
    const results = await Promise.all(["new-password", "other-password"].map(password => request(server.address, `resets/${token}`, "POST", "", { password })));
    expect(results.map(r => r.status).sort()).toEqual([200, 404]);
    await server.restart();
    await server.clock.advance(7 * 24 * 60 * 60 * 1000 - 1);
    expect((await request(server.address, `resets/${expired}`)).status).toBe(200);
    await server.clock.advance(1);
    for (const invalid of [token, expired, "unknown"]) {
      for (const method of ["GET", "POST"]) {
        const response = await request(server.address, `resets/${invalid}`, method, "", method === "POST" ? { password: "new-password" } : undefined);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "link_invalid", message: "This link is invalid or has expired." });
      }
    }
  } finally { await server.dispose(); }
});

test("changing a password requires the current password and keeps only the caller signed in", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const account = await inviteAccount(server, admin.cookie, "Player", "test-password");
    const second = await signIn(server, "Player", "test-password");
    for (const [cookie, currentPassword, newPassword, status, error] of [
      ["", "test-password", "new-password", 401, "not_signed_in"],
      [account.cookie, "wrong", "new-password", 403, "wrong_password"],
      [account.cookie, "test-password", "short", 400, "password_too_short"],
    ]) {
      const response = await request(server.address, "account/password", "POST", cookie as string, { currentPassword, newPassword });
      expect(response.status).toBe(status as number);
      expect(await response.json()).toEqual({ error, message: expect.any(String) });
      expect((await (await request(server.address, "status", "GET", second.cookie)).json() as any).account).toEqual(account.account);
    }
    const response = await request(server.address, "account/password", "POST", account.cookie, { currentPassword: "test-password", newPassword: "new-password" });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    await server.restart();
    expect((await (await request(server.address, "status", "GET", account.cookie)).json() as any).account).toEqual(account.account);
    expect((await request(server.address, "rooms", "GET", second.cookie)).status).toBe(401);
    expect((await (await request(server.address, "status", "GET", admin.cookie)).json() as any).account).toEqual(admin.account);
    expect((await request(server.address, "sign-in", "POST", "", { username: "Player", password: "test-password" })).status).toBe(401);
    expect((await signIn(server, "Player", "new-password")).account).toEqual(account.account);
  } finally { await server.dispose(); }
});

test("password routes keep the setup lock and changing routes refuse foreign origins", async () => {
  const server = await startTestServer();
  try {
    const routes = [["account/password", "POST"], ["admin/accounts/unknown/reset-link", "POST"], ["resets/unknown", "GET"], ["resets/unknown", "POST"]];
    for (const [path, method] of routes) {
      const response = await request(server.address, path, method);
      expect(response.status).toBe(403);
      expect((await response.json() as any).error).toBe("setup_required");
    }
    const admin = await setupAdministrator(server);
    const { token } = await (await request(server.address, `admin/accounts/${admin.account.id}/reset-link`, "POST", admin.cookie)).json() as any;
    for (const path of ["account/password", `admin/accounts/${admin.account.id}/reset-link`, `resets/${token}`]) {
      const response = await fetch(`${server.address}/api/${path}`, { method: "POST", headers: { Cookie: admin.cookie, Origin: "https://foreign.example", "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: "test-password", newPassword: "new-password", password: "new-password" }) });
      expect(response.status).toBe(403);
      expect((await response.json() as any).error).toBe("origin_not_allowed");
    }
    expect((await request(server.address, `resets/${token}`)).status).toBe(200);
    expect((await signIn(server, "Administrator", "test-password")).account).toEqual(admin.account);
  } finally { await server.dispose(); }
});

test("malformed password bodies return JSON errors without consuming a reset link", async () => {
  const server = await startTestServer();
  try {
    const admin = await setupAdministrator(server);
    const { token } = await (await request(server.address, `admin/accounts/${admin.account.id}/reset-link`, "POST", admin.cookie)).json() as any;
    for (const [path, error, status] of [[`resets/${token}`, "password_too_short", 400], ["account/password", "wrong_password", 403]] as const) {
      const response = await fetch(`${server.address}/api/${path}`, { method: "POST", headers: { Cookie: admin.cookie, "Content-Type": "application/json" }, body: "{" });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error, message: expect.any(String) });
    }
    expect((await request(server.address, `resets/${token}`)).status).toBe(200);
    expect((await (await request(server.address, "status", "GET", admin.cookie)).json() as any).account).toEqual(admin.account);
  } finally { await server.dispose(); }
});
