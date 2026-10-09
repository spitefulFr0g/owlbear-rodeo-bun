import { expect, test } from "bun:test";
import { signIn, setupAdministrator, startTestServer } from "./testing/serverHelpers";

function signInRequest(address: string, username: unknown, password: unknown) {
  return fetch(`${address}/api/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
}
function status(address: string, cookie: string) {
  return fetch(`${address}/api/status`, { headers: { Cookie: cookie } });
}

test("the right password signs in with any username capitals and the setup cookie flags", async () => {
  const server = await startTestServer();
  try {
    const { account } = await setupAdministrator(server, "First.GM", "long-password");
    const response = await signInRequest(server.address, "fIRST.gm", "long-password");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ account });
    const cookie = response.headers.get("set-cookie")!;
    for (const flag of ["owlbear_sign_in=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) expect(cookie).toContain(flag);
    expect(cookie).not.toContain("Secure");
    expect(await (await status(server.address, cookie.split(";")[0])).json()).toEqual({ setup: "closed", account });
  } finally { await server.dispose(); }
});

test("unknown usernames, wrong passwords and malformed credentials get the same answer", async () => {
  const server = await startTestServer();
  try {
    await setupAdministrator(server);
    const responses = [
      await signInRequest(server.address, "Unknown", "test-password"),
      await signInRequest(server.address, "Administrator", "wrong-password"),
      await signInRequest(server.address, null, null),
      await fetch(`${server.address}/api/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "invalid_credentials", message: "Your username or password is incorrect." });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  } finally { await server.dispose(); }
});

const DAY = 24 * 60 * 60 * 1000;

test("a sign-in used on day 29 refreshes its cookie and still works on day 58", async () => {
  const server = await startTestServer();
  try {
    const { account } = await setupAdministrator(server);
    const response = await signInRequest(server.address, "Administrator", "test-password");
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    await server.clock.advance(29 * DAY);
    const used = await status(server.address, cookie);
    expect(await used.json()).toEqual({ setup: "closed", account });
    expect(used.headers.get("set-cookie")).toContain(`${cookie}; Max-Age=2592000`);
    await server.clock.advance(29 * DAY);
    expect(await (await status(server.address, cookie)).json()).toEqual({ setup: "closed", account });
  } finally { await server.dispose(); }
});

test("a sign-in unused for exactly 30 days has ended, including after setup", async () => {
  const server = await startTestServer();
  try {
    const setup = await setupAdministrator(server);
    const response = await signInRequest(server.address, "Administrator", "test-password");
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    await server.clock.advance(30 * DAY);
    for (const value of [cookie, setup.cookie]) {
      const expired = await status(server.address, value);
      expect(await expired.json()).toEqual({ setup: "closed", account: null });
      expect(expired.headers.get("set-cookie")).toBeNull();
    }
  } finally { await server.dispose(); }
});

test("use within an hour does not renew the cookie or extend the sign-in", async () => {
  const server = await startTestServer();
  try {
    const { account, cookie } = await setupAdministrator(server);
    await server.clock.advance(30 * 60 * 1000);
    const used = await status(server.address, cookie);
    expect(await used.json()).toEqual({ setup: "closed", account });
    expect(used.headers.get("set-cookie")).toBeNull();
    await server.clock.advance(30 * DAY - 30 * 60 * 1000);
    await server.restart();
    expect(await (await status(server.address, cookie)).json()).toEqual({ setup: "closed", account: null });
  } finally { await server.dispose(); }
});

test("signing out ends only that browser's sign-in and clears even an absent cookie", async () => {
  const server = await startTestServer();
  try {
    const first = await setupAdministrator(server);
    const response = await signInRequest(server.address, "Administrator", "test-password");
    const second = response.headers.get("set-cookie")!.split(";")[0];
    expect(second).not.toBe(first.cookie);
    for (const cookie of [first.cookie, first.cookie, ""]) {
      const out = await fetch(`${server.address}/api/sign-out`, { method: "POST", headers: { Cookie: cookie } });
      expect(out.status).toBe(204);
      expect(await out.text()).toBe("");
      expect(out.headers.get("set-cookie")).toContain("owlbear_sign_in=;");
      expect(out.headers.get("set-cookie")).toContain("Expires=Thu, 01 Jan 1970");
      for (const flag of ["HttpOnly", "SameSite=Lax", "Path=/"]) expect(out.headers.get("set-cookie")).toContain(flag);
    }
    expect(await (await status(server.address, first.cookie)).json()).toEqual({ setup: "closed", account: null });
    expect(await (await status(server.address, second)).json()).toEqual({ setup: "closed", account: first.account });
  } finally { await server.dispose(); }
});

test("the sign-in helper returns the account and cookie that survive a restart", async () => {
  const server = await startTestServer();
  try {
    const { account } = await setupAdministrator(server);
    const signedIn = await signIn(server, "administrator", "test-password");
    expect(signedIn.account).toEqual(account);
    expect(signedIn.cookie).toMatch(/^owlbear_sign_in=[a-f0-9]{64}$/);
    await server.clock.advance(29 * DAY);
    await server.restart();
    const used = await status(server.address, signedIn.cookie);
    expect(await used.json()).toEqual({ setup: "closed", account });
    expect(used.headers.get("set-cookie")).toContain("Max-Age=2592000");
    await server.restart();
    await server.clock.advance(29 * DAY);
    expect(await (await status(server.address, signedIn.cookie)).json()).toEqual({ setup: "closed", account });
  } finally { await server.dispose(); }
});

test("sign-in and sign-out keep the setup lock and origin check", async () => {
  const server = await startTestServer();
  try {
    for (const path of ["sign-in", "sign-out"]) {
      const locked = await fetch(`${server.address}/api/${path}`, { method: "POST" });
      expect(locked.status).toBe(403);
      expect((await locked.json() as { error: string }).error).toBe("setup_required");
    }
    const { account, cookie } = await setupAdministrator(server);
    for (const path of ["sign-in", "sign-out"]) {
      const refused = await fetch(`${server.address}/api/${path}`, { method: "POST", headers: { Origin: "https://foreign.example", Cookie: cookie } });
      expect(refused.status).toBe(403);
      expect((await refused.json() as { error: string }).error).toBe("origin_not_allowed");
    }
    expect(await (await status(server.address, cookie)).json()).toEqual({ setup: "closed", account });
    await server.joinRoom("anonymous-room");
  } finally { await server.dispose(); }
});
