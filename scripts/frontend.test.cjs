const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { borrowedModules, setup, prepare } = require("./frontend.cjs");

// Hooks export Git paths for the caller; fixture repositories own their state.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("GIT_")) delete process.env[key];
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "owlbear-worktree-"));
const main = path.join(directory, "main");
const worktree = path.join(directory, "worktree");
const git = (...args) => execFileSync("git", args, { cwd: main, stdio: "ignore" });
try {
  fs.mkdirSync(main);
  git("init");
  const pkg = { dependencies: { react: "17" } };
  const write = (repo, file, text) => fs.writeFileSync(path.join(repo, file), text);
  write(main, "package.json", JSON.stringify(pkg));
  write(main, "yarn.lock", "same lock");
  git("add", "package.json", "yarn.lock");
  git("-c", "commit.gpgsign=false", "-c", "user.name=Worktree test", "-c", "user.email=test@example.invalid",
    "-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture");
  git("worktree", "add", "--detach", worktree);
  assert.throws(() => setup(worktree), /dependencies are missing/);
  const modules = path.join(main, "node_modules");
  fs.mkdirSync(path.join(modules, ".bin"), { recursive: true });
  write(modules, ".bin/vite", "bundler fixture");
  // A scripts-only package change still shares the same dependencies.
  write(worktree, "package.json", JSON.stringify({ ...pkg, scripts: { check: "changed" } }));
  setup(worktree);
  const link = path.join(worktree, "node_modules");
  assert.strictEqual(fs.realpathSync(link), modules);
  setup(worktree); // Existing links are reusable and validated again.
  write(worktree, "yarn.lock", "changed lock");
  assert.throws(() => setup(worktree), /dependencies differ/);
  let installs = 0;
  prepare(worktree, repo => {
    installs++;
    assert.strictEqual(repo, worktree);
    assert.strictEqual(fs.existsSync(link), false);
    fs.mkdirSync(path.join(link, ".bin"), { recursive: true });
    write(link, ".bin/vite", "installed bundler fixture");
  });
  assert.strictEqual(installs, 1);
  assert.strictEqual(fs.existsSync(path.join(modules, ".bin/vite")), true);
  fs.rmSync(link, { recursive: true });
  assert.strictEqual(borrowedModules(worktree), undefined);
  assert.throws(() => setup(worktree), /dependencies are missing/);
  write(worktree, "yarn.lock", "same lock");
  write(worktree, "package.json", JSON.stringify({ dependencies: { react: "18" } }));
  assert.strictEqual(borrowedModules(worktree), undefined);
  write(worktree, "package.json", JSON.stringify(pkg));
  const unrelated = path.join(directory, "unrelated");
  fs.mkdirSync(unrelated);
  fs.symlinkSync(unrelated, link, "dir");
  assert.throws(() => setup(worktree), /somewhere other than the main checkout/);
  assert.throws(() => prepare(worktree, () => { throw new Error("must not install"); }), /somewhere other than the main checkout/);
  assert.strictEqual(fs.readlinkSync(link), unrelated);
  fs.unlinkSync(link);
  fs.mkdirSync(path.join(link, ".bin"), { recursive: true });
  write(link, ".bin/vite", "local bundler fixture");
  assert.strictEqual(setup(worktree), link);
  assert.strictEqual(borrowedModules(worktree), undefined);
  console.log("Frontend dependency sharing checks passed");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
