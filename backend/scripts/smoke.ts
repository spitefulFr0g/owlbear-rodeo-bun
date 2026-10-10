/**
 * Smoke check of the real server on the real clock, which the tests never
 * run: sets up, makes a room, joins it as the GM and uploads an image, then
 * restarts on the same data directory and expects the sign-in, the room and
 * the image back. Anything unexpected on stderr fails.
 *
 *   bun scripts/smoke.ts                                  the server from source
 *   bun scripts/smoke.ts <executable>                     a compiled executable
 *   bun scripts/smoke.ts <executable> --from <released>   an upgrade: the released
 *       executable (v0.2.0 or later) makes the data, <executable> opens it
 */
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { io } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";

const args = process.argv.slice(2);
const fromFlag = args.indexOf("--from");
const released = fromFlag < 0 ? undefined : args.splice(fromFlag, 2)[1];
if (fromFlag >= 0 && !released) throw new Error("--from needs the path of a released executable");
const command = args[0] ? [args[0]] : ["bun", join(import.meta.dir, "..", "src", "index.ts")];
const dataDir = await mkdtemp(join(tmpdir(), "owlbear-smoke-"));
const expected = [
  // A server started from source may have no frontend build to embed.
  /^No frontend is embedded/,
  // A dependency of the compiled executable still calls url.parse().
  /\[DEP0169\]/,
  /--trace-warnings/,
];
const unexpected: string[] = [];

async function start(command: string[]) {
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

/** Joins the room as its GM and answers with the socket and the token for assets. */
async function joinAsGM(address: string, roomId: string, cookie: string) {
  const socket = io(address, { parser: msgParser, transports: ["websocket"], reconnection: false, extraHeaders: { Cookie: cookie } });
  const token = await new Promise<string>((resolve, reject) => {
    socket.once("joined_game", (_id: string, token: string) => resolve(token));
    socket.once("connect_error", reject);
    setTimeout(() => reject(new Error("The GM did not join the room within 10 seconds")), 10000).unref();
    socket.emit("join_game", roomId, "");
  });
  return { socket, token };
}

const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
let server = await start(released ? [released] : command);
try {
  const setup = await post(server.address, "/api/setup", { username: "Administrator", password: "smoke-password" });
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const { room } = await (await post(server.address, "/api/rooms", { name: "Smoke room" }, cookie)).json() as { room: { id: string } };

  const first = await joinAsGM(server.address, room.id, cookie);
  const upload = await fetch(`${server.address}/assets/smoke-image`, {
    method: "PUT",
    body: image,
    headers: { Authorization: `Bearer ${first.token}`, "Content-Type": "image/png", "X-Asset-Width": "4", "X-Asset-Height": "2", "X-Asset-Owner": "gm" },
  });
  if (upload.status !== 201) throw new Error(`The image upload answered ${upload.status}: ${await upload.text()}`);
  // Long enough for a timer that fires at once to show itself on stderr.
  await Bun.sleep(3000);
  first.socket.disconnect();

  await server.stop();
  server = await start(command);
  const list = await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } });
  if (list.status !== 200) throw new Error(`The sign-in did not last through the restart: ${list.status}`);
  const { rooms } = await list.json() as { rooms: { id: string }[] };
  if (!rooms.some(saved => saved.id === room.id)) throw new Error("The room was not there after the restart");
  const second = await joinAsGM(server.address, room.id, cookie);
  const kept = await fetch(`${server.address}/assets/smoke-image`, { headers: { Authorization: `Bearer ${second.token}` } });
  if (kept.status !== 200 || !Buffer.from(await kept.arrayBuffer()).equals(Buffer.from(image))) {
    throw new Error(`The image was not there after the restart: ${kept.status}`);
  }
  await Bun.sleep(1000);
  second.socket.disconnect();
} finally {
  await server.stop();
  await rm(dataDir, { recursive: true, force: true });
}

if (unexpected.length > 0) {
  console.error(`Unexpected output on stderr (${unexpected.length} lines):\n${unexpected.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log("Smoke check passed");
