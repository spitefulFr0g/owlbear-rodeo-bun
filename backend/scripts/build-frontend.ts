/**
 * Builds the Create React App frontend into ../build.
 *
 * CRA 4 needs Node 16, so by default this runs inside the node:16 Docker
 * image. Pass --local to use the Node and Yarn on your PATH instead.
 *
 * In a git worktree with no node_modules of its own, the Docker build borrows
 * the main checkout's, as long as both have the same yarn.lock.
 */
import { $ } from "bun";
import { existsSync, readdirSync, readFileSync, rmdirSync } from "fs";
import { dirname, join, resolve } from "path";

const repoDir = join(import.meta.dir, "..", "..");
const install = "yarn install --frozen-lockfile --non-interactive";

/** The main checkout's node_modules, when this worktree can build with them */
async function borrowedModules(): Promise<string | undefined> {
  const own = join(repoDir, "node_modules");
  if (existsSync(own) && readdirSync(own).length > 0) return undefined;
  const commonDir = (await $`git rev-parse --git-common-dir`.cwd(repoDir).text()).trim();
  const mainDir = dirname(resolve(repoDir, commonDir));
  const modules = join(mainDir, "node_modules");
  if (mainDir === resolve(repoDir) || !existsSync(modules)) return undefined;
  const lock = (dir: string) => readFileSync(join(dir, "yarn.lock"), "utf8");
  return lock(mainDir) === lock(repoDir) ? modules : undefined;
}

if (process.argv.includes("--local")) {
  await $`sh -c ${`${install} && yarn build`}`.cwd(repoDir);
} else {
  const user =
    process.getuid && process.getgid
      ? ["--user", `${process.getuid()}:${process.getgid()}`]
      : [];
  const borrowed = await borrowedModules();
  const modules = borrowed ? ["-v", `${borrowed}:/app/node_modules`] : [];
  const build = borrowed ? "yarn build" : `${install} && yarn build`;
  try {
    await $`docker run --rm ${user} -e HOME=/tmp -e NODE_OPTIONS=--max-old-space-size=4096 -v ${repoDir}:/app ${modules} -w /app node:16.20.0 sh -c ${build}`;
  } finally {
    // Docker leaves an empty directory where it mounted the borrowed modules
    if (borrowed) rmdirSync(join(repoDir, "node_modules"));
  }
}
