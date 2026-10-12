/** An isolated public-protocol peer for the T3 held-interaction browser check. */
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { io, Socket } from "socket.io-client";
import parser from "socket.io-msgpack-parser";
import { realClock } from "../src/clock";
import { startServer } from "../src/server";
import { createRoom, nextMessage, sendBatch, setupAdministrator } from "../src/testing/serverHelpers";
import { Change, PresenceState, Scene, ShapeItem } from "../../src/sceneRules";

interface FixtureConfig {
  address: string; control: string; token: string; username: string; password: string;
  roomId: string; pid: number;
}
const args = process.argv.slice(2);
const configPath = args[args.indexOf("--config") + 1];
if (!args.includes("--config") || !configPath) throw new Error("Pass --config <temporary output file>");

if (args[0] === "control") {
  const config = await Bun.file(configPath).json() as FixtureConfig;
  const action = args[args.indexOf("--action") + 1];
  const response = await fetch(config.control, {
    method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action }), signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Fixture control failed: ${response.status} ${await response.text()}`);
  console.log(JSON.stringify(await response.json()));
} else if (args[0] === "serve") {
  const dataDir = await mkdtemp(join(tmpdir(), "owlbear-held-interactions-"));
  const server = await startServer({ dataDir, port: 0, allowOrigin: null, clock: realClock });
  const username = "GestureVerification", password = crypto.randomUUID();
  const { cookie } = await setupAdministrator(server, username, password);
  const room = await createRoom(server, cookie, "Held interaction verification");
  const connections = new Set<Socket>();
  const connect = async () => {
    const socket = io(server.address, { parser, transports: ["websocket"], reconnection: false, extraHeaders: { Cookie: cookie } });
    connections.add(socket);
    const snapshot = nextMessage(socket, "scene_snapshot"), joined = nextMessage(socket, "joined_game"), presence = nextMessage(socket, "presence_state");
    socket.emit("join_game", room.id, "", undefined, { playerId: "fixture-peer" });
    const [[value], , [presences]] = await Promise.all([snapshot, joined, presence]);
    return { socket, scene: (value as { scene: Scene }).scene, presences: presences as PresenceState };
  };
  const peer = await connect();
  let barrierId = 1_000_000;
  const sceneId = peer.scene.id;
  const ack = (event: string, value: unknown) => new Promise<void>((resolve, reject) => {
    peer.socket.timeout(5000).emit(event, value, (error: Error | null, result: { ok?: boolean }) => {
      if (error || result?.ok === false) reject(error ?? new Error(`${event} refused`)); else resolve();
    });
  });
  await ack("session", true);
  await ack("room_switches", { drawing: true });
  await ack("scene_settings", { sceneId, grid: { ...peer.scene.grid, snap: false } });
  const item: ShapeItem = {
    id: "held-check", kind: "shape", layer: "drawing", owner: "gm", order: 0,
    position: { x: 200, y: 200 }, rotation: 0, scale: { x: 1, y: 1 }, locked: false, hidden: false, metadata: {},
    geometry: { type: "rectangle", width: 100, height: 100 }, color: "#ff0000", strokeWidth: 1, fill: true, blend: false, cut: false,
  };
  const snapshot = async () => {
    const observer = await connect();
    observer.socket.disconnect(); connections.delete(observer.socket);
    return observer.scene;
  };
  const change = async (action: string) => {
    if (action === "barrier-frame") {
      const id = barrierId++;
      const encoded = new parser.Encoder().encode({ type: 2, nsp: "/", id, data: ["room_switches", null] });
      const frame = Array.isArray(encoded) ? encoded[0] : encoded;
      if (!(frame instanceof Uint8Array || frame instanceof ArrayBuffer)) throw new Error("Unsupported MessagePack encoder output");
      return { id, frame: Buffer.from(frame instanceof ArrayBuffer ? new Uint8Array(frame) : frame).toString("base64") };
    }
    if (action === "state") return { scene: await snapshot() };
    const current = await snapshot();
    const changes: Change[] = [];
    if (action === "reset") {
      for (const id of Object.keys(current.items)) changes.push({ type: "delete", id });
      changes.push({ type: "add", item });
    } else if (action === "commit") {
      changes.push({ type: "update", id: item.id, fields: { position: { x: 450, y: 500 } } });
    } else if (action === "player-owner") {
      const observer = await connect();
      const player = Object.values(observer.presences).find(value => value.role === "player" && value.userId);
      observer.socket.disconnect(); connections.delete(observer.socket);
      if (!player?.userId) throw new Error("The anonymous browser has not joined");
      changes.push({ type: "update", id: item.id, fields: { owner: player.userId } });
    } else if (action === "delete") changes.push({ type: "delete", id: item.id });
    else if (action === "lock") changes.push({ type: "update", id: item.id, fields: { locked: true } });
    else throw new Error(`Unknown action: ${action}`);
    // The marker proves the browser rendered this exact authoritative batch.
    const marker = `barrier-${crypto.randomUUID()}`;
    changes.push({ type: "add", item: { ...item, id: marker, position: { x: 9000, y: 9000 } } });
    const answer = await sendBatch(peer.socket, { id: crypto.randomUUID(), sceneId, changes });
    if (answer.refused.length) throw new Error(`Public scene batch refused: ${JSON.stringify(answer.refused)}`);
    return { marker, scene: await snapshot() };
  };
  await change("reset");
  const token = crypto.randomUUID();
  let busy = false;
  const control = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    if (request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${token}`) return new Response("Forbidden", { status: 403 });
    if (busy) return new Response("Another gesture action is running", { status: 409 });
    busy = true;
    try {
      const { action } = await request.json() as { action: string };
      return Response.json(await change(action));
    } catch (error) { return new Response(String(error), { status: 400 }); }
    finally { busy = false; }
  }});
  const config: FixtureConfig = { address: server.address, control: `http://127.0.0.1:${control.port}`, token, username, password, roomId: room.id, pid: process.pid };
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  console.log(`Fixture ready; config: ${configPath}`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    control.stop(true);
    for (const socket of connections) socket.disconnect();
    await server.stop();
    await rm(dataDir, { recursive: true, force: true });
    await rm(configPath, { force: true });
    process.exit();
  };
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });
} else throw new Error("Use serve or control");
