/**
 * Compiles the server and the embedded frontend into standalone executables.
 *
 *   bun run build                 # all targets
 *   bun run build linux-x64       # selected targets
 *
 * Build the frontend first (`bun run build:frontend`), or the executables
 * will only contain the game server.
 */
import { $ } from "bun";
import { join } from "path";

const targets: Record<string, string> = {
  "linux-x64": "owlbear-rodeo-linux-x64",
  "windows-x64": "owlbear-rodeo-windows-x64.exe",
};

const selected = process.argv.slice(2);
for (const name of selected) {
  if (!(name in targets)) {
    console.error(
      `Unknown target "${name}". Choose from: ${Object.keys(targets).join(", ")}`
    );
    process.exit(1);
  }
}

const backendDir = join(import.meta.dir, "..");
$.cwd(backendDir);

await $`bun scripts/embed-frontend.ts`;

for (const name of selected.length > 0 ? selected : Object.keys(targets)) {
  const outfile = join("dist", targets[name]);
  console.log(`Compiling ${outfile}`);
  await $`bun build src/index.ts --compile --minify --sourcemap --target=bun-${name} --outfile ${outfile}`;
}
