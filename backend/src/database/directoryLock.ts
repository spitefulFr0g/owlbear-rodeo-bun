import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { join } from "path";

/** A separate SQLite file holds an OS lock without blocking application writes. */
export function lockDataDirectory(dataDir: string): () => void {
  let lock: Database | undefined;
  try {
    mkdirSync(dataDir, { recursive: true });
    lock = new Database(join(dataDir, ".owlbear-lock.db"), { create: true });
    lock.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE");
  } catch (error) {
    lock?.close();
    if ((error as { code?: string }).code === "SQLITE_BUSY") {
      throw new Error(`Cannot use ${dataDir}: another server is using this data directory. Stop that server, or choose another directory with --data-dir.`);
    }
    throw new Error(`Cannot lock data directory ${dataDir}: ${(error as Error).message}. Check directory permissions and use a local disk, or choose another directory with --data-dir.`);
  }
  return () => lock!.close();
}
