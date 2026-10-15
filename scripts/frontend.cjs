const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function borrowedModules(repo = root) {
  const own = path.join(repo, "node_modules");
  const ownStat = fs.lstatSync(own, { throwIfNoEntry: false });
  const linked = ownStat && ownStat.isSymbolicLink();
  if (ownStat && !linked) return undefined;
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repo, encoding: "utf8",
  }).trim();
  const main = path.dirname(path.resolve(repo, common));
  const modules = path.join(main, "node_modules");
  if (main === repo || !fs.existsSync(modules)) return undefined;
  if (linked && fs.realpathSync(own) !== fs.realpathSync(modules)) {
    throw new Error("node_modules links somewhere other than the main checkout; use a local install");
  }
  const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
  const dependencies = dir => {
    const pkg = JSON.parse(read(dir, "package.json"));
    return JSON.stringify(["dependencies", "devDependencies", "optionalDependencies", "resolutions"].map(key =>
      Object.entries(pkg[key] || {}).sort(([a], [b]) => a.localeCompare(b))));
  };
  if (read(main, "yarn.lock") !== read(repo, "yarn.lock") || dependencies(main) !== dependencies(repo)) {
    if (linked) throw new Error("frontend dependencies differ from the main checkout; remove the borrowed node_modules link and run yarn install --frozen-lockfile");
    return undefined;
  }
  return modules;
}

function setup(repo = root) {
  const borrowed = borrowedModules(repo);
  const modules = path.join(repo, "node_modules");
  if (borrowed && !fs.existsSync(modules)) fs.symlinkSync(borrowed, modules, "dir");
  if (!fs.existsSync(path.join(modules, ".bin", "vite"))) {
    throw new Error("frontend dependencies are missing; run yarn install --frozen-lockfile in the main checkout or this worktree");
  }
  return modules;
}

function run(command) {
  const modules = setup();
  if (command === "check") execFileSync(process.execPath, [path.join(root, "scripts/frontend.test.cjs")], {
    cwd: root, stdio: "inherit",
  });
  if (command === "check") execFileSync(process.execPath, ["--test", path.join(root, "scripts/checks.test.cjs"), path.join(root, "scripts/release-notes.test.cjs")], {
    cwd: root, stdio: "inherit",
  });
  const commands = {
    typecheck: ["typescript/bin/tsc", "--noEmit"],
    lint: ["eslint/bin/eslint.js", "--ext", ".js,.jsx,.ts,.tsx", "src", "--max-warnings=0"],
    test: ["vitest/vitest.mjs", "run"],
    build: ["vite/bin/vite.js", "build"],
  };
  // The backend embeds build/ by file name, so a check builds somewhere else.
  const scratch = command === "check" ? fs.mkdtempSync(path.join(os.tmpdir(), "frontend-check-")) : undefined;
  try {
    for (const name of scratch ? ["typecheck", "lint", "test", "build"] : [command]) {
      if (!commands[name]) throw new Error(`unknown frontend check: ${name}`);
      const [script, ...args] = commands[name];
      if (scratch && name === "build") args.push("--outDir", scratch, "--emptyOutDir", "--logLevel", "warn");
      execFileSync(process.execPath, [path.join(modules, script), ...args], {
        cwd: root, stdio: "inherit", env: { ...process.env, CI: "true" },
      });
    }
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
  }
}

module.exports = { borrowedModules, setup };

if (require.main === module) {
  try {
    if (process.argv[2] === "setup") setup();
    else run(process.argv[2]);
  } catch (error) {
    if (!error.status) console.error(`frontend: ${error.message}`);
    process.exit(error.status || 1);
  }
}
