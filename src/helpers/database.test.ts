import Dexie from "dexie";
import indexedDB from "fake-indexeddb";
import IDBKeyRange from "fake-indexeddb/lib/FDBKeyRange";
import { getDatabase } from "../database";

const options = { indexedDB, IDBKeyRange };

for (const version of [1, 41, 42]) {
  test(`upgrading version ${version} keeps identity and nickname and removes library storage`, async () => {
    const name = `identity-upgrade-${version}`;
    // Independent historical fixture: no production migration code.
    const old = new Dexie(name, options);
    old.version(version).stores({
      user: "key", maps: "id, owner", tokens: "id, owner",
      groups: "id", states: "mapId", assets: "id, owner",
    });
    await old.open();
    await old.table("user").bulkAdd([
      { key: "userId", value: "player-123" },
      { key: "nickname", value: "Owlbear" },
    ]);
    for (const table of ["maps", "tokens", "groups", "states", "assets"]) {
      await old.table(table).add({ id: "image", mapId: "map", file: new Uint8Array([1, 2]) });
    }
    old.close();
    const db = getDatabase(options, name);
    try {
      await db.open();
      expect(db.tables.map(table => table.name)).toEqual(["user"]);
      expect(await db.table("user").toArray()).toEqual([
        { key: "nickname", value: "Owlbear" },
        { key: "userId", value: "player-123" },
      ]);
      db.close();
      await db.open();
      expect(await db.table("user").get("userId")).toEqual({ key: "userId", value: "player-123" });
    } finally { await db.delete(); }
  });
}

test("a fresh browser stores only its player id and nickname", async () => {
  const db = getDatabase(options, "fresh-identity");
  try {
    await db.open();
    expect(db.tables.map(table => table.name)).toEqual(["user"]);
    const rows = await db.table("user").toArray();
    expect(rows.map(row => row.key)).toEqual(["nickname", "userId"]);
    expect(rows.every(row => typeof row.value === "string" && row.value.length > 0)).toBe(true);
  } finally { await db.delete(); }
});
