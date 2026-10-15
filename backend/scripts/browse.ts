/** Starts an owned, provisioned temporary server. Stop it with the printed PID. */
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

type Ready = { address: string; pid: number; roomId: string; username: string; password: string };

export async function launchBrowse(port = 0) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port needs an integer from 0 to 65535");
  const dataDir = await mkdtemp(join(tmpdir(), "owlbear-browse-"));
  const log = join(dataDir, "server.log");
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "browse-server.ts"), dataDir, String(port)], {
    stdout: Bun.file(log), stderr: Bun.file(log), stdin: "ignore", detached: true,
  });
  child.unref();
  async function stop() {
    if (child.exitCode === null) child.kill("SIGTERM");
    const timer = setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2000);
    try { await child.exited; }
    finally { clearTimeout(timer); await rm(dataDir, { recursive: true, force: true }); }
  }
  const interrupted = () => { void stop().finally(() => process.exit(130)); };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  try {
    const deadline = Date.now() + 15000;
    while (child.exitCode === null && Date.now() < deadline) {
      let ready: Ready | undefined;
      try { ready = JSON.parse(await readFile(join(dataDir, "ready.json"), "utf8")) as Ready; }
      catch (error: any) { if (error.code !== "ENOENT") throw error; }
      if (ready && ready.pid === child.pid && child.exitCode === null) return { ...ready, dataDir, log, stop };
      await Bun.sleep(50);
    }
    throw new Error("The server did not start");
  } catch (error) {
    const details = await readFile(log, "utf8").catch(() => "");
    await stop();
    throw Object.assign(new Error(`${error instanceof Error ? error.message : error}\n${details}`), { pid: child.pid, dataDir });
  } finally {
    process.removeListener("SIGINT", interrupted);
    process.removeListener("SIGTERM", interrupted);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2), flag = args.indexOf("--port");
  if (flag >= 0 && !args[flag + 1]) throw new Error("--port needs a number");
  const fixture = await launchBrowse(flag < 0 ? 0 : Number(args[flag + 1]));
  console.log(`Server:   ${fixture.address}  (pid ${fixture.pid}, log ${fixture.log})
Sign in:  ${fixture.username} / ${fixture.password}
Room:     ${fixture.address}/game/${fixture.roomId}
Stop it:  kill ${fixture.pid}`);
  process.exit(0);
}
