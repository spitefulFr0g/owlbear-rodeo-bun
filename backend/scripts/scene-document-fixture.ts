/** Rebuild the stopped-database fixture; tests only copy it and use the server. */
import { Database } from "bun:sqlite";
import { gzipSync } from "zlib";
import { readFile, rm } from "fs/promises";
import { join } from "path";
import { createRoom, setupAdministrator, startTestServer } from "../src/testing/serverHelpers";

let directory = "";
const server = await startTestServer(async dir => { directory = dir; });
const { cookie } = await setupAdministrator(server);
const rooms = [];
for (const version of [1, 2, 3]) rooms.push(await createRoom(server, cookie, `Version ${version}`));
await server.stop();
const database = new Database(join(directory, "owlbear.db"));
const item = { id: "note", kind: "text", layer: "note", position: { x: 123, y: -456 }, rotation: 0, scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: false, hidden: false, metadata: {}, text: "Kept through upgrade", color: "yellow", size: 150, square: true };
const grid = { type: "hexHorizontal", unitsPerCell: 150, measurement: { type: "euclidean", scale: "10m" }, shown: false, snap: false };
const scene = { id: "old-scene", grid, items: { note: item } };
const styled = { ...scene, name: "Ambush", fogFill: true, viewOnly: true, grid: { ...grid, opacity: 0.3, lineWidth: 4, color: "#123ABC" } };
const documents = [
  { openSceneId: scene.id, scenes: { [scene.id]: scene } },
  { openSceneId: scene.id, scenes: { [scene.id]: scene } },
  { openSceneId: scene.id, welcomeSceneId: "prepared", scenes: { [scene.id]: styled, prepared: { ...styled, id: "prepared", name: "Next room" } } },
];
for (let i = 0; i < rooms.length; i++) database.query("UPDATE rooms SET id = ?, documentVersion = ?, document = ? WHERE id = ?")
  .run(`version-${i + 1}`, i + 1, JSON.stringify(documents[i]), rooms[i].id);
database.exec("PRAGMA user_version = 1");
database.close();
await Bun.write(join(import.meta.dir, "../src/testing/fixtures/scene-documents.db.gz"), gzipSync(await readFile(join(directory, "owlbear.db"))));
await rm(directory, { recursive: true, force: true });
