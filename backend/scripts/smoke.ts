/**
 * Smoke check of the real server on the real clock, which the tests never
 * run: sets up, makes a room, joins it as the GM and uploads an image, then
 * restarts on the same data directory and expects the sign-in, the room and
 * the image back. Anything unexpected on stderr fails.
 *
 *   bun scripts/smoke.ts                                  the server from source
 *   bun scripts/smoke.ts <executable>                     a compiled executable
 *   bun scripts/smoke.ts <executable> --from <released>   an upgrade: the released
 *       executable (v0.4.0) makes the data, <executable> opens it
 */
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
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
];
const unexpected: string[] = [];

/** Starts a server. Only the one under test has its stderr judged, a released one has shipped. */
async function start(command: string[], judged = true) {
  const server = Bun.spawn([...command, "--port", "0", "--data-dir", dataDir], { stdout: "pipe", stderr: "pipe" });
  const errors = (async () => {
    const lines = (await new Response(server.stderr).text()).split("\n").filter(line => line.trim());
    if (judged) unexpected.push(...lines.filter(line => !expected.some(pattern => pattern.test(line))));
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
  let ownerOnly: boolean | undefined;
  let snapshot: { scene: import("../../src/sceneRules").Scene } | undefined;
  socket.on("scene_snapshot", value => { snapshot = value; });
  const token = await new Promise<string>((resolve, reject) => {
    socket.once("joined_game", (_id: string, token: string, info: { room: { switches: { ownerOnly?: boolean } } }) => {
      ownerOnly = info.room.switches.ownerOnly;
      resolve(token);
    });
    socket.once("connect_error", reject);
    setTimeout(() => reject(new Error("The GM did not join the room within 10 seconds")), 10000).unref();
    socket.emit("join_game", roomId, "");
  });
  return { socket, token, get snapshot() { return snapshot; }, get ownerOnly() { return ownerOnly; } };
}

const note = { id: "smoke-note", kind: "text", layer: "note", position: { x: 123, y: -456 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: false, hidden: false, metadata: {},
  text: "Kept across the upgrade", color: "yellow", size: 150, square: true };
let originalDatabase: Buffer | undefined;
let savedSceneId: string;
const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
let server = released ? await start([released], false) : await start(command);
try {
  const setup = await post(server.address, "/api/setup", { username: "Administrator", password: "smoke-password" });
  const cookie = setup.headers.get("set-cookie")!.split(";")[0];
  const { room } = await (await post(server.address, "/api/rooms", { name: "Smoke room" }, cookie)).json() as { room: { id: string } };

  const first = await joinAsGM(server.address, room.id, cookie);
  await new Promise(resolve => first.socket.emit("get_display_token", resolve));
  savedSceneId = first.snapshot!.scene.id;
  const placed = new Promise<any>(resolve => first.socket.once("scene_answer", resolve));
  first.socket.emit("scene_changes", { id: "smoke-place", sceneId: savedSceneId, changes: [{ type: "add", item: note }] });
  const answer = await placed;
  if (answer.refused.length || answer.applied.length !== 1) throw new Error("The smoke note was not placed");
  const grid = { type: "hexHorizontal", unitsPerCell: 150, measurement: { type: "euclidean", scale: "10m" }, shown: false, snap: false };
  const styledGrid = { ...grid, opacity: 0.8, lineWidth: 3, color: "#333333" };
  const gridAnswer = await new Promise<any>(resolve => first.socket.emit("scene_settings", { sceneId: savedSceneId, grid: styledGrid }, resolve));
  if (!gridAnswer.ok) throw new Error("The smoke grid was not changed");
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
  if (released) originalDatabase = await readFile(join(dataDir, "owlbear.db"));
  server = await start(command);
  const list = await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } });
  if (list.status !== 200) throw new Error(`The sign-in did not last through the restart: ${list.status}`);
  const { rooms } = await list.json() as { rooms: { id: string }[] };
  if (!rooms.some(saved => saved.id === room.id)) throw new Error("The room was not there after the restart");
  const second = await joinAsGM(server.address, room.id, cookie);
  // The acknowledgement follows the join snapshot on the same connection.
  await new Promise(resolve => second.socket.emit("get_display_token", resolve));
  const scene = second.snapshot?.scene;
  if (!scene || scene.id !== savedSceneId || JSON.stringify(scene.items["smoke-note"]) !== JSON.stringify(note) ||
      Object.keys(scene.items).length !== 1 || Object.entries(styledGrid).some(([key, value]) => JSON.stringify(scene.grid[key as keyof typeof scene.grid]) !== JSON.stringify(value)) ||
      scene.fogFill !== false || scene.viewOnly !== false || scene.movementMode !== true || "name" in scene) {
    throw new Error("The restarted or upgraded room did not keep its scene, note, grid and new defaults");
  }
  if (released) {
    const backup = await readFile(join(dataDir, "owlbear.db.before-upgrade"));
    if (!backup.equals(originalDatabase!)) throw new Error("The pre-upgrade copy did not preserve the released database");
    const database = new Database(join(dataDir, "owlbear.db"), { readonly: true });
    try {
      const version = database.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
      if (version !== 3) throw new Error(`The upgraded layout version was ${version}, expected 3`);
    } finally { database.close(); }
  }
  if (second.ownerOnly !== false) throw new Error("The restarted or upgraded room did not default Owner Only to off");
  const kept = await fetch(`${server.address}/assets/smoke-image`, { headers: { Authorization: `Bearer ${second.token}` } });
  if (kept.status !== 200 || !Buffer.from(await kept.arrayBuffer()).equals(Buffer.from(image))) {
    throw new Error(`The image was not there after the restart: ${kept.status}`);
  }
  const settingsAnswer = await new Promise<any>(resolve => second.socket.emit("room_switches", { tokens: false }, resolve));
  if (!settingsAnswer.ok) throw new Error("Could not save the upgraded room");
  await Bun.sleep(1000);
  second.socket.disconnect();
  await server.stop();
  const database = new Database(join(dataDir, "owlbear.db"), { readonly: true });
  try {
    const record = database.query<{ documentVersion: number; document: string }, [string]>("SELECT documentVersion, document FROM rooms WHERE id = ?").get(room.id)!;
    const document = JSON.parse(record.document);
    if (record.documentVersion !== 3 || document.openSceneId !== savedSceneId || document.welcomeSceneId !== null ||
        document.scenes[savedSceneId].name !== "Scene 1") throw new Error("The room was not saved as document version 3 with its scene name and no welcome screen");
  } finally { database.close(); }
  if (released) {
    const old = Bun.spawn([released, "--port", "0", "--data-dir", dataDir], { stdout: "ignore", stderr: "pipe" });
    const timeout = setTimeout(() => old.kill(), 10000);
    try {
      const error = await new Response(old.stderr).text();
      if (await old.exited === 0 || !error.includes("newer layout version 3")) throw new Error(`The released executable did not refuse upgraded data: ${error}`);
    } finally { clearTimeout(timeout); old.kill(); }
  }
} finally {
  await server.stop();
  await rm(dataDir, { recursive: true, force: true });
}

if (unexpected.length > 0) {
  console.error(`Unexpected output on stderr (${unexpected.length} lines):\n${unexpected.slice(0, 20).join("\n")}`);
  process.exit(1);
}
console.log("Smoke check passed");
