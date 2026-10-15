import { expect, test } from "bun:test";
import { launchBrowse } from "./browse";
import { access } from "fs/promises";

test("parallel browser fixtures bind different ports and provision their own room", async () => {
  const fixtures: Awaited<ReturnType<typeof launchBrowse>>[] = [];
  try {
    const results = await Promise.allSettled([0, 0].map(async port => { fixtures.push(await launchBrowse(port)); }));
    for (const result of results) if (result.status === "rejected") throw result.reason;
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0].address).not.toBe(fixtures[1].address);
    expect(fixtures[0].pid).not.toBe(fixtures[1].pid);
    for (const fixture of fixtures) {
      const login = await fetch(`${fixture.address}/api/sign-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: fixture.username, password: fixture.password }) });
      expect(login.status).toBe(200);
      const rooms = await fetch(`${fixture.address}/api/rooms`, { headers: { Cookie: login.headers.get("set-cookie")! } });
      expect(JSON.stringify(await rooms.json())).toContain(fixture.roomId);
    }
  } finally { await Promise.all(fixtures.map(fixture => fixture.stop())); }
  for (const fixture of fixtures) {
    await expect(access(fixture.dataDir)).rejects.toThrow();
    expect(() => process.kill(fixture.pid, 0)).toThrow();
  }
}, 15000);

test("an occupied browser port receives no provisioning requests and the failed child is cleaned up", async () => {
  let requests = 0;
  const existing = Bun.serve({ port: 0, fetch() { requests++; return new Response("existing server"); } });
  try {
    const error = await launchBrowse(existing.port!).then(() => null, error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("did not start");
    expect(error.message).toMatch(/EADDRINUSE|in use/i);
    expect(requests).toBe(0);
    expect(() => process.kill(error.pid, 0)).toThrow();
    await expect(access(error.dataDir)).rejects.toThrow();
  } finally { await existing.stop(true); }
}, 15000);
