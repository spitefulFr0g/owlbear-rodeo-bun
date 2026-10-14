/**
 * Starts the server from source for a look in a browser, already set up: an
 * administrator and one room on a fresh temporary data directory. The server
 * keeps running after this script exits; it prints how to stop it.
 *
 *   bun run browse                 on port 9100
 *   bun run browse --port <port>
 */
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createRoom, setupAdministrator } from "../src/testing/serverHelpers";

const args = process.argv.slice(2);
const portFlag = args.indexOf("--port");
const port = portFlag < 0 ? "9100" : args[portFlag + 1];
if (!port) throw new Error("--port needs a number");

const dataDir = await mkdtemp(join(tmpdir(), "owlbear-browse-"));
const log = join(dataDir, "server.log");
const server = Bun.spawn(["bun", join(import.meta.dir, "..", "src", "index.ts"), "--port", port, "--data-dir", dataDir], {
  stdout: Bun.file(log), stderr: Bun.file(log), stdin: "ignore", detached: true,
});
server.unref();

const address = `http://localhost:${port}`;
const deadline = Date.now() + 15_000;
while (!(await fetch(address).then(response => response.ok, () => false))) {
  if (server.exitCode !== null || Date.now() > deadline) {
    throw new Error(`The server did not start:\n${await Bun.file(log).text()}`);
  }
  await Bun.sleep(200);
}

const username = "Administrator";
const password = "browse-password";
const { cookie } = await setupAdministrator({ address }, username, password);
const room = await createRoom({ address }, cookie, "Browse room");

console.log(`Server:   ${address}  (pid ${server.pid}, log ${log})
Sign in:  ${username} / ${password}
Room:     ${address}/game/${room.id}
Stop it:  kill ${server.pid}`);
process.exit(0);
