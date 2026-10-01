/**
 * Builds the Create React App frontend into ../build.
 *
 * CRA 4 needs Node 16, so by default this runs inside the node:16 Docker
 * image. Pass --local to use the Node and Yarn on your PATH instead.
 */
import { $ } from "bun";
import { join } from "path";

const repoDir = join(import.meta.dir, "..", "..");
const build = "yarn install --frozen-lockfile --non-interactive && yarn build";

if (process.argv.includes("--local")) {
  await $`sh -c ${build}`.cwd(repoDir);
} else {
  const user =
    process.getuid && process.getgid
      ? ["--user", `${process.getuid()}:${process.getgid()}`]
      : [];
  await $`docker run --rm ${user} -e HOME=/tmp -e NODE_OPTIONS=--max-old-space-size=4096 -v ${repoDir}:/app -w /app node:16.20.0 sh -c ${build}`;
}
