import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, renameSync, rmSync, statSync, writeFileSync } from "fs";

export interface UpgradeStep { version: number; sql: string }
// Future released layouts add steps in increasing version order.
export const upgradeSteps: readonly UpgradeStep[] = [];

export function inspectDatabase(path: string, supportedVersion: number): number {
  let database: Database | undefined;
  let version: number;
  let snapshot: Uint8Array | undefined;
  try {
    database = new Database(path, { readonly: true });
    const result = database.query<{ integrity_check: string }, []>("PRAGMA integrity_check").all();
    if (result.length !== 1 || result[0].integrity_check !== "ok") throw new Error("integrity check failed");
    // A stopped database can still have a WAL after a crash. Include its
    // committed pages in the recovery copy without changing the original.
    if (existsSync(`${path}-wal`) && statSync(`${path}-wal`).size > 0) snapshot = database.serialize();
    version = database.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
  } catch (error) {
    throw new Error(`Cannot read database ${path}: ${(error as Error).message}. With the server stopped, restore ${path}.before-upgrade if available, or restore your backup.`);
  } finally { database?.close(); }
  if (version > supportedVersion) {
    throw new Error(`Database ${path} has newer layout version ${version}; this executable supports ${supportedVersion}. Use a newer executable, or restore ${path}.before-upgrade with the server stopped to go back.`);
  }
  if (version < supportedVersion) {
    const temporaryCopy = `${path}.before-upgrade.tmp`;
    try {
      if (snapshot) writeFileSync(temporaryCopy, snapshot);
      else copyFileSync(path, temporaryCopy);
      renameSync(temporaryCopy, `${path}.before-upgrade`);
    }
    catch (error) {
      rmSync(temporaryCopy, { force: true });
      throw new Error(`Cannot save the pre-upgrade copy ${path}.before-upgrade: ${(error as Error).message}. Check permissions and free disk space before starting again.`);
    }
  }
  return version;
}
