/**
 * Builds the Create React App frontend into ../build.
 *
 * CRA 4 needs Node 16, so by default this runs inside the node:16 Docker
 * image. Pass --local to use the Node and Yarn on your PATH instead.
 *
 * In a git worktree with no node_modules of its own, the Docker build borrows
 * the main checkout's, as long as their dependency declarations and lock match.
 */
import { $ } from "bun";
import { existsSync, lstatSync, readlinkSync, rmdirSync } from "fs";
import { join, resolve } from "path";

const { borrowedModules } = require("../../scripts/frontend.cjs");

const repoDir = join(import.meta.dir, "..", "..");
const install = "yarn install --frozen-lockfile --non-interactive";

if (process.argv.includes("--local")) {
  const build = borrowedModules(repoDir) ? "yarn build" : `${install} && yarn build`;
  await $`sh -c ${build}`.cwd(repoDir);
} else {
  const user =
    process.getuid && process.getgid
      ? ["--user", `${process.getuid()}:${process.getgid()}`]
      : [];
  const borrowed: string | undefined = borrowedModules(repoDir);
  const own = join(repoDir, "node_modules");
  const link = borrowed && existsSync(own) && lstatSync(own).isSymbolicLink()
    ? readlinkSync(own) : undefined;
  // Mount at the link's target inside the container, keeping host imports usable.
  const destination = link ? resolve("/app", link) : "/app/node_modules";
  const modules = borrowed ? ["-v", `${borrowed}:${destination}`] : [];
  const build = borrowed ? "yarn build" : `${install} && yarn build`;
  try {
    await $`docker run --rm ${user} -e HOME=/tmp -e NODE_OPTIONS=--max-old-space-size=4096 -v ${repoDir}:/app ${modules} -w /app node:16.20.0 sh -c ${build}`;
  } finally {
    // Docker leaves an empty directory where it mounted the borrowed modules
    if (borrowed && !link && existsSync(own)) rmdirSync(own);
  }
}
