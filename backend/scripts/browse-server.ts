import { rename, rm } from "fs/promises";
import { join } from "path";
import { startServer } from "../src/server";
import { realClock } from "../src/clock";
import { createRoom, setupAdministrator } from "../src/testing/serverHelpers";

// Provision through the address returned by this instance, never a probed port.
const [dataDir, port] = process.argv.slice(2);
let server: Awaited<ReturnType<typeof startServer>> | undefined;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await server?.stop(); }
  finally { await rm(dataDir, { recursive: true, force: true }); }
}
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
  void stop().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
});

try {
  server = await startServer({ dataDir, port: Number(port), allowOrigin: null, clock: realClock });
  const username = "Administrator", password = "browse-password";
  const { cookie } = await setupAdministrator(server, username, password);
  const room = await createRoom(server, cookie, "Browse room");
  const ready = { address: server.address, pid: process.pid, roomId: room.id, username, password };
  await Bun.write(join(dataDir, "ready.tmp"), JSON.stringify(ready));
  await rename(join(dataDir, "ready.tmp"), join(dataDir, "ready.json"));
} catch (error) {
  console.error(error);
  // The launcher retains diagnostics, stops this child and removes the directory.
  await server?.stop();
  process.exit(1);
}
