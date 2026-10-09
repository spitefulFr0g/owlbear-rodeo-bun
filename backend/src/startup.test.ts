import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { startServer } from "./server";
import { TestClock } from "./testing/serverHelpers";
import { startTestServer } from "./testing/serverHelpers";

test("a newer database refuses startup without changing the file and explains recovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "owlbear-startup-"));
  try {
    const path = join(dir, "owlbear.db");
    const db = new Database(path);
    db.exec("PRAGMA user_version = 2; CREATE TABLE future (value TEXT)");
    db.close();
    const before = await readFile(path);
    await expect(startTestServer(undefined, dir)).rejects.toThrow("newer");
    expect(await readFile(path)).toEqual(before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("an unreadable database names the file and recovery copy without replacing its bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "owlbear-startup-"));
  try {
    const path = join(dir, "owlbear.db");
    await Bun.write(path, "damaged database");
    await expect(startTestServer(undefined, dir)).rejects.toThrow(`${path}.before-upgrade`);
    expect(await readFile(path, "utf8")).toBe("damaged database");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a second server refuses the same directory until the first stops", async () => {
  let dir = "";
  const first = await startTestServer(async (value) => { dir = value; });
  try {
    await expect(startTestServer(undefined, dir)).rejects.toThrow("another server");
    await first.stop();
    const second = await startTestServer(undefined, dir);
    await second.stop();
  } finally { await first.dispose(); }
});

async function olderDatabase(dir: string, value: string) {
  const db = new Database(join(dir, "owlbear.db"));
  db.exec("CREATE TABLE old_records (value TEXT); PRAGMA user_version = 0");
  db.query("INSERT INTO old_records VALUES (?)").run(value);
  db.close();
}

test("an older database is copied before upgrade and a later upgrade replaces that copy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "owlbear-startup-"));
  try {
    const path = join(dir, "owlbear.db");
    await olderDatabase(dir, "first");
    const firstBytes = await readFile(path);
    let server = await startTestServer(undefined, dir);
    await server.stop();
    expect(await readFile(`${path}.before-upgrade`)).toEqual(firstBytes);
    expect(await readFile(path)).not.toEqual(firstBytes);
    await rm(path);
    await olderDatabase(dir, "later");
    const laterBytes = await readFile(path);
    server = await startTestServer(undefined, dir);
    await server.stop();
    expect(await readFile(`${path}.before-upgrade`)).toEqual(laterBytes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a partially failed upgrade leaves the database unchanged and releases directory ownership", async () => {
  const dir = await mkdtemp(join(tmpdir(), "owlbear-startup-"));
  try {
    const path = join(dir, "owlbear.db");
    await olderDatabase(dir, "kept");
    const before = await readFile(path);
    await expect(startServer({ dataDir: dir, port: 0, allowOrigin: null, clock: new TestClock(),
      databaseUpgrades: [{ version: 1, sql: "CREATE TABLE partial (value TEXT); INSERT INTO missing VALUES (1)" }],
    })).rejects.toThrow(`Restore ${path}.before-upgrade`);
    expect(await readFile(path)).toEqual(before);
    expect(await readFile(`${path}.before-upgrade`)).toEqual(before);
    const server = await startTestServer(undefined, dir);
    await server.stop();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("killing a server releases directory ownership for the next start", async () => {
  const dir = await mkdtemp(join(tmpdir(), "owlbear-startup-"));
  const child = Bun.spawn([process.execPath, "-e", `
    import { startServer } from './src/server';
    import { TestClock } from './src/testing/serverHelpers';
    await startServer({dataDir: ${JSON.stringify(dir)}, port: 0, allowOrigin: null, clock: new TestClock()});
    console.log('READY');
  `], { stdout: "pipe", stderr: "pipe" });
  try {
    const reader = child.stdout.getReader();
    let output = "";
    while (!output.includes("READY")) {
      const next = await reader.read();
      if (next.done) throw new Error(`Child failed to start: ${output}`);
      output += new TextDecoder().decode(next.value);
    }
    await expect(startTestServer(undefined, dir)).rejects.toThrow("another server");
    child.kill(9);
    await child.exited;
    const server = await startTestServer(undefined, dir);
    await server.stop();
  } finally {
    child.kill(9);
    await child.exited;
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);

test("a damaged SQLite database refuses startup without emptying it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "owlbear-startup-"));
  try {
    const path = join(dir, "owlbear.db");
    await olderDatabase(dir, "saved");
    const damaged = await readFile(path);
    damaged.fill(0xff, 100, 200);
    await Bun.write(path, damaged);
    await expect(startTestServer(undefined, dir)).rejects.toThrow(`Cannot read database ${path}`);
    expect(await readFile(path)).toEqual(damaged);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
