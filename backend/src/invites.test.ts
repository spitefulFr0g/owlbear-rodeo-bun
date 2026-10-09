import { expect, test } from "bun:test";
import { inviteAccount, setupAdministrator, startTestServer } from "./testing/serverHelpers";

function request(address: string, path: string, method = "GET", cookie = "", body?: unknown) {
  return fetch(`${address}/api/${path}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("only an administrator can list accounts or make invite links", async () => {
  const server = await startTestServer();
  try {
    const administrator = await setupAdministrator(server);
    for (const [path, method] of [["admin/accounts", "GET"], ["admin/invites", "POST"]]) {
      const refused = await request(server.address, path, method);
      expect(refused.status).toBe(401);
      expect(await refused.json()).toEqual({ error: "not_signed_in", message: "Sign in to continue." });
    }
    const list = await request(server.address, "admin/accounts", "GET", administrator.cookie);
    expect(await list.json()).toEqual({ accounts: [administrator.account] });
  } finally { await server.dispose(); }
});

test("an invite creates an ordinary account, signs it in and lists accounts by username", async () => {
  const server = await startTestServer();
  try {
    const administrator = await setupAdministrator(server, "Zulu");
    const made = await request(server.address, "admin/invites", "POST", administrator.cookie);
    expect(made.status).toBe(201);
    const { token, expiresAt } = await made.json() as { token: string; expiresAt: number };
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt).toBe(Date.UTC(2026, 0, 8));
    expect(await (await request(server.address, `invites/${token}`)).json()).toEqual({});
    const used = await request(server.address, `invites/${token}`, "POST", "", { username: "Alpha", password: "test-password" });
    expect(used.status).toBe(201);
    const { account } = await used.json() as { account: { id: string; username: string; administrator: boolean } };
    expect(account).toEqual({ id: expect.any(String), username: "Alpha", administrator: false });
    const cookie = used.headers.get("set-cookie")!;
    for (const flag of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) expect(cookie).toContain(flag);
    expect(cookie).not.toContain("Secure");
    expect((await (await request(server.address, "status", "GET", cookie.split(";")[0])).json() as any).account).toEqual(account);
    for (const [path, method] of [["admin/accounts", "GET"], ["admin/invites", "POST"]]) {
      const refused = await request(server.address, path, method, cookie.split(";")[0]);
      expect(refused.status).toBe(403);
      expect((await refused.json() as any).error).toBe("not_administrator");
    }
    expect(await (await request(server.address, "admin/accounts", "GET", administrator.cookie)).json()).toEqual({ accounts: [account, administrator.account] });
    await request(server.address, "sign-out", "POST", cookie.split(";")[0]);
    const signedIn = await request(server.address, "sign-in", "POST", "", { username: "alpha", password: "test-password" });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual({ account });
  } finally { await server.dispose(); }
});

test("invalid credentials leave the invite usable, including a taken username with different capitals", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const { token } = await (await request(server.address, "admin/invites", "POST", cookie)).json() as any;
    for (const [username, password, code, status] of [
      ["aDMINISTRATOR", "test-password", "username_taken", 409],
      ["ab", "test-password", "username_length", 400],
      ["a".repeat(33), "test-password", "username_length", 400],
      ["bad name", "test-password", "username_characters", 400],
      ["Valid", "short", "password_too_short", 400],
      [null, null, "username_length", 400],
    ]) {
      const refused = await request(server.address, `invites/${token}`, "POST", "", { username, password });
      expect(refused.status).toBe(status as number);
      const body = await refused.json() as any;
      expect(body.error).toBe(code);
      expect(body.message).toEqual(expect.any(String));
      expect(refused.headers.get("set-cookie")).toBeNull();
      expect((await request(server.address, `invites/${token}`)).status).toBe(200);
    }
    expect((await request(server.address, `invites/${token}`, "POST", "", { username: "Valid", password: "test-password" })).status).toBe(201);
  } finally { await server.dispose(); }
});

test("used, expired and unknown links give the same answer and simultaneous uses create one account", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const make = async () => (await (await request(server.address, "admin/invites", "POST", cookie)).json() as any).token as string;
    const used = await make();
    const results = await Promise.all(["First", "Second"].map(username => request(server.address, `invites/${used}`, "POST", "", { username, password: "test-password" })));
    expect(results.map(response => response.status).sort()).toEqual([201, 404]);
    expect((await (await request(server.address, "admin/accounts", "GET", cookie)).json() as any).accounts).toHaveLength(2);
    const expired = await make();
    await server.restart();
    await server.clock.advance(7 * 24 * 60 * 60 * 1000 - 1);
    expect((await request(server.address, `invites/${expired}`)).status).toBe(200);
    await server.clock.advance(1);
    for (const token of [used, expired, "unknown"]) {
      for (const method of ["GET", "POST"]) {
        const response = await request(server.address, `invites/${token}`, method, "", method === "POST" ? { username: "Later", password: "test-password" } : undefined);
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "link_invalid", message: "This link is invalid or has expired." });
      }
    }
    expect((await (await request(server.address, "admin/accounts", "GET", cookie)).json() as any).accounts).toHaveLength(2);
  } finally { await server.dispose(); }
});

test("invite routes keep the setup lock and changing routes refuse a foreign origin", async () => {
  const server = await startTestServer();
  try {
    for (const [path, method] of [["admin/accounts", "GET"], ["admin/invites", "POST"], ["invites/unknown", "GET"], ["invites/unknown", "POST"]]) {
      const locked = await request(server.address, path, method);
      expect(locked.status).toBe(403);
      expect((await locked.json() as any).error).toBe("setup_required");
    }
    const { cookie } = await setupAdministrator(server);
    const { token } = await (await request(server.address, "admin/invites", "POST", cookie)).json() as any;
    for (const path of ["admin/invites", `invites/${token}`]) {
      const refused = await fetch(`${server.address}/api/${path}`, { method: "POST", headers: { Cookie: cookie, Origin: "https://foreign.example" } });
      expect(refused.status).toBe(403);
      expect((await refused.json() as any).error).toBe("origin_not_allowed");
    }
    expect((await request(server.address, `invites/${token}`)).status).toBe(200);
    for (const path of ["register", "accounts", "admin/accounts", "setup"]) {
      expect((await request(server.address, path, "POST", cookie, { username: "Stranger", password: "test-password" })).status).not.toBe(201);
    }
    expect((await (await request(server.address, "admin/accounts", "GET", cookie)).json() as any).accounts).toHaveLength(1);
  } finally { await server.dispose(); }
});


test("the invite account helper returns an account and sign-in that survive a restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const invited = await inviteAccount(server, cookie, "Helper.Account", "test-password");
    await server.restart();
    expect((await (await request(server.address, "status", "GET", invited.cookie)).json() as any).account).toEqual(invited.account);
    expect(invited.account.administrator).toBe(false);
  } finally { await server.dispose(); }
});

test("malformed invite credentials get a JSON error and leave the link usable", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const { token } = await (await request(server.address, "admin/invites", "POST", cookie)).json() as any;
    const response = await fetch(`${server.address}/api/invites/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    expect(response.status).toBe(400);
    expect((await response.json() as any).error).toBe("username_length");
    expect((await request(server.address, `invites/${token}`)).status).toBe(200);
  } finally { await server.dispose(); }
});
