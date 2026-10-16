// eslint-disable-next-line no-unused-vars
import Dexie, { DexieOptions } from "dexie";
import { v4 as uuid } from "uuid";
import { getRandomMonster } from "./helpers/monsters";

/** Browser identity only. Library removal is one-way, including older schemas. */
export function getDatabase(
  options: DexieOptions,
  name = "OwlbearRodeoDB"
): Dexie {
  const db = new Dexie(name, options);
  db.version(43).stores({
    user: "key",
    maps: null,
    tokens: null,
    groups: null,
    states: null,
    assets: null,
    _changes: null,
    _intercomm: null,
    _syncNodes: null,
    _uncommittedChanges: null,
  });
  db.on("populate", () => db.table("user").bulkAdd([
    { key: "userId", value: uuid() },
    { key: "nickname", value: getRandomMonster() },
  ]));
  return db;
}
