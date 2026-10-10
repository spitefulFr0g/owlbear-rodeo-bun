/**
 * Smoke check of the real server on the real clock, which the tests never
 * run: sets up, makes a room, joins it as the GM, restarts on the same data
 * directory and expects the room back. Anything unexpected on stderr fails.
 *
 *   bun scripts/smoke.ts                 the server from source
 *   bun scripts/smoke.ts <executable>    a compiled executable
 */
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { io } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";

const executable = process.argv[2];
const command = executable ? [executable] : ["bun", join(import.meta.dir, "..", "src", "index.ts")];
const dataDir = await mkdtemp(join(tmpdir(), "owlbear-smoke-"));
const expected = [
  // A server started from source may have no frontend build to embed.
  /^No frontend is embedded/,
  // A dependency of the compiled executable still calls url.parse().
  /\[DEP0169\]/,
  /--trace-warnings/,
];
const unexpected: string[] = [];

async function start() {
  const server = Bun.spawn([...command, "--port", "0", "--data-dir", dataDir], { stdout: "pipe", stderr: "pipe" });
  const errors = (async () => {
    const lines = (await new Response(server.stderr).text()).split("\n").filter(line => line.trim());
    unexpected.push(...lines.filter(line => !expected.some(pattern => pattern.test(line))));
  })();
  let output = "";
  const decoder = new TextDecoder();
  for await (const chunk of server.stdout) {
    output += decoder.decode(chunk);
    const address = output.match(/http:\/\/localhost:\d+/)?.[0];
    if (address) {
      return {
        address,
        async stop() {
          server.kill("SIGTERM");
          await server.exited;
          await errors;
        },
      };
    }
  }
  await errors;
  throw new Error(`The server did not start:\n${output}\n${unexpected.join("\n")}`);
}

async function post(address: string, path: string, body: unknown, cookie?: string) {
  const response = await fetch(address + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  if (response.status !== 201) throw new Error(`POST ${path} answered ${response.status}: ${await response.text()}`);
  return response;
}

let server = await start();
try {
  const setup = await post(server.address, "/api/setup", { username: "Administrator", password: "smoke-password" });
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const { room } = await (await post(server.address, "/api/rooms", { name: "Smoke room" }, cookie)).json() as { room: { id: string } };

  const socket = io(server.address, { parser: msgParser, transports: ["websocket"], reconnection: false, extraHeaders: { Cookie: cookie } });
  await new Promise<void>((resolve, reject) => {
    socket.once("joined_game", () => resolve());
    socket.once("connect_error", reject);
    setTimeout(() => reject(new Error("The GM did not join the room within 10 seconds")), 10000).unref();
    socket.emit("join_game", room.id, "");
  });
  // Long enough for a timer that fires at once to show itself on stderr.
  await Bun.sleep(3000);
  socket.disconnect();

  await server.stop();
  server = await start();
  const { rooms } = await (await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } })).json() as { rooms: { id: string }[] };
  if (!rooms.some(saved => saved.id === room.id)) throw new Error("The room was not there after a restart");
} finally {
  await server.stop();
  await rm(dataDir, { recursive: true, force: true });
}

if (unexpected.length > 0) {
  console.error(`Unexpected output on stderr (${unexpected.length} lines):\n${unexpected.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log("Smoke check passed");
