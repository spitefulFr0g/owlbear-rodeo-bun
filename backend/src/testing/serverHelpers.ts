import { cp, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { io, Socket } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";
import { Clock } from "../clock";
import { RunningServer, startServer } from "../server";

export class TestClock implements Clock {
  private time: number;
  private tasks = new Map<number, { at: number; task: () => void | Promise<void> }>();
  private nextId = 0;

  constructor(time = Date.UTC(2026, 0, 1)) { this.time = time; }
  now() { return this.time; }
  after(delayMs: number, task: () => void | Promise<void>) {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.time + Math.max(0, delayMs), task });
    return () => { this.tasks.delete(id); };
  }
  async advance(ms: number) {
    if (ms < 0 || !Number.isFinite(ms)) throw new Error("Clock must move forward by a finite duration");
    const end = this.time + ms;
    for (;;) {
      const next = [...this.tasks].filter(([, value]) => value.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.time = next[1].at;
      this.tasks.delete(next[0]);
      await next[1].task();
    }
    this.time = end;
  }
}

export function nextMessage(socket: Socket, event: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const receive = (...args: any[]) => {
      clearTimeout(timeout);
      resolve(args);
    };
    // A deadline catches missing network messages; server time uses TestClock.
    const timeout = setTimeout(() => {
      socket.off(event, receive);
      reject(new Error(`Did not receive ${event}`));
    }, 2000);
    socket.once(event, receive);
  });
}

/** Owns a temporary directory across restarts; dispose it in a finally block. */
export async function startTestServer(prepare?: (dataDir: string) => Promise<void>, preparedDataDir?: string) {
  const dataDir = preparedDataDir ?? await mkdtemp(join(tmpdir(), "owlbear-server-"));
  const clock = new TestClock();
  const options = { dataDir, clock, port: 0, allowOrigin: null };
  let server: RunningServer;
  try {
    await prepare?.(dataDir);
    server = await startServer(options);
  }
  catch (error) {
    if (!preparedDataDir) await rm(dataDir, { recursive: true, force: true });
    throw error;
  }
  const sockets = new Set<Socket>();
  const connect = () => {
    const socket = io(server.address, { parser: msgParser, transports: ["websocket"], reconnection: false });
    sockets.add(socket);
    return socket;
  };
  return {
    clock,
    connect,
    get address() { return server.address; },
    async joinRoom(roomId: string, password = "") {
      const socket = connect();
      const map = nextMessage(socket, "map");
      const mapState = nextMessage(socket, "map_state");
      const manifest = nextMessage(socket, "manifest");
      const party = nextMessage(socket, "party_state");
      const joined = nextMessage(socket, "joined_game");
      const frozen = nextMessage(socket, "display_frozen");
      socket.emit("join_game", roomId, password);
      const [[, token], [displayFrozen]] = await Promise.all([joined, frozen]);
      const [[savedMap], [savedState], [savedManifest], [partyState]] = await Promise.all([map, mapState, manifest, party]);
      return { socket, token: token as string, state: { map: savedMap, mapState: savedState, manifest: savedManifest, partyState }, displayFrozen };
    },
    // Capture durable files without invoking the clean-stop flush. The tests
    // recover this copy through a second whole server, never through SQLite.
    async durableCopy() {
      return startTestServer(async (copyDir) => {
        await cp(join(dataDir, "owlbear.db"), join(copyDir, "owlbear.db"));
        await cp(join(dataDir, "assets"), join(copyDir, "assets"), { recursive: true });
      });
    },
    stop: () => server.stop(),
    async restart() {
      await server.stop();
      for (const socket of sockets) socket.disconnect();
      sockets.clear();
      server = await startServer(options);
    },
    async dispose() {
      await server.stop();
      for (const socket of sockets) socket.disconnect();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** Creates the first administrator through the same setup route a browser uses. */
export async function setupAdministrator(server: Pick<RunningServer, "address">, username = "Administrator", password = "test-password") {
  const response = await fetch(`${server.address}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status !== 201) throw new Error(`Administrator setup failed: ${await response.text()}`);
  const { account } = await response.json() as { account: import("../accounts/Accounts").Account };
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  return { account, cookie };
}
