const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const git = (repo, ...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
const digest = value => crypto.createHash("sha256").update(value).digest("hex");

function checkEnvironment(env) {
  const result = { ...env };
  // Git prepends its helpers to hook PATH. Restore the caller's executable search.
  if (result.GIT_EXEC_PATH && result.PATH?.startsWith(result.GIT_EXEC_PATH + path.delimiter)) {
    result.PATH = result.PATH.slice(result.GIT_EXEC_PATH.length + 1);
  }
  // Checks create isolated Git fixtures; checkout-specific variables must stay here.
  for (const key of Object.keys(result)) if (key.startsWith("GIT_")) delete result[key];
  return result;
}

// Receipts exist only during a guarded merge. Ordinary commits run fresh checks.
function fingerprint(repo, command, cwd, env) {
  const hash = crypto.createHash("sha256");
  const add = value => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    hash.update(`${bytes.length}:`); hash.update(bytes);
  };
  add([command, path.resolve(cwd), process.version, process.platform, process.arch]);
  add(Object.entries(env).filter(([key]) =>
    !/^(?:GIT_|OWLBEAR_CHECK_)/.test(key) && !["_", "SHLVL", "PWD", "OLDPWD"].includes(key)).sort());
  add(git(repo, "write-tree"));
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: repo }).toString().split("\0");
  for (const name of [...new Set(files)].filter(Boolean).sort()) {
    const file = path.join(repo, name);
    add(name);
    try {
      const stat = fs.lstatSync(file);
      add([stat.mode, stat.isSymbolicLink() ? fs.readlinkSync(file) : null]);
      add(fs.readFileSync(file));
    }
    catch (error) { if (error.code !== "ENOENT") throw error; add(null); }
  }
  // Builds and local environment files are ignored by Git but affect checks.
  function include(file) {
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) include(path.join(file, name));
    } else { add(file); add(fs.readFileSync(file)); }
  }
  include(path.join(repo, "build"));
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local", ".env.test", ".env.test.local"]) include(path.join(repo, name));
  for (const directory of ["node_modules", "backend/node_modules"]) {
    const modules = path.join(repo, directory);
    if (!fs.existsSync(modules)) { add([directory, null]); continue; }
    add([directory, fs.realpathSync(modules), fs.statSync(modules).mtimeMs]);
    // Detect installs/version changes even when node_modules is a borrowed link.
    for (const name of fs.readdirSync(modules).sort()) {
      if (name.startsWith(".")) continue;
      const packages = name.startsWith("@") ? fs.readdirSync(path.join(modules, name)).map(child => `${name}/${child}`) : [name];
      for (const pkg of packages) {
        const manifest = path.join(modules, pkg, "package.json");
        if (fs.existsSync(manifest)) include(manifest);
      }
    }
  }
  try { add(execFileSync("bun", ["--version"], { env, encoding: "utf8" })); }
  catch { add("bun unavailable"); }
  return hash.digest("hex");
}

function readReceipt(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value.version === 1 && value.entries && typeof value.entries === "object" ? value : { version: 1, entries: {} };
  } catch { return { version: 1, entries: {} }; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n"); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}

async function runCheck(command, { repo = root, cwd = repo, env = process.env, receiptFile = env.OWLBEAR_CHECK_RECEIPT, quiet = false } = {}) {
  env = checkEnvironment(env);
  const key = digest(JSON.stringify([path.resolve(cwd), command]));
  const before = receiptFile ? fingerprint(repo, command, cwd, env) : null;
  if (receiptFile && readReceipt(receiptFile).entries[key]?.fingerprint === before) {
    if (!quiet) console.log(`CHECK_REUSED ${JSON.stringify({ command, cwd })}`);
    return;
  }
  const started = Date.now();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (status, signal) => resolve(status ?? (signal ? 1 : 0)));
  });
  const result = { command, cwd, exitCode: code, durationMs: Date.now() - started };
  if (!quiet) console.log(`CHECK_RESULT ${JSON.stringify(result)}`);
  if (code !== 0) throw Object.assign(new Error(`Check failed: ${command.join(" ")}`), { exitCode: code });
  if (receiptFile && fingerprint(repo, command, cwd, env) === before) {
    const receipt = readReceipt(receiptFile);
    receipt.entries[key] = { ...result, fingerprint: before };
    writeJson(receiptFile, receipt);
  }
}

function testTimings(output) {
  const tests = [];
  let file = "";
  for (const line of output.replace(/\u001b\[[0-9;]*m/g, "").split(/\r?\n/)) {
    if (/\.(?:test|spec)\.[^:]+:$/.test(line)) file = line.slice(0, -1);
    const match = line.match(/^\((pass|fail)\) (.+?)(?: \[([\d.]+)(ms|s|µs|us)\])?$/);
    if (match) tests.push({ file, name: match[2], status: match[1], durationMs: match[3] === undefined ? null : Number(match[3]) * ({ ms: 1, s: 1000, "µs": 0.001, us: 0.001 })[match[4]] });
  }
  const totalMs = tests.reduce((sum, test) => sum + test.durationMs, 0);
  const timed = tests.filter(test => test.durationMs !== null);
  const slowest = [...timed].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  const dominant = slowest.filter(test => test.durationMs >= 30000 && test.durationMs >= totalMs / 2);
  return { testCount: tests.length, timedTestCount: timed.length, totalMs, slowest, dominant };
}

async function backendTests(args, repo = root) {
  let output = "";
  const started = Date.now();
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn("bun", ["test", "./src", "../src/sceneRules", "../src/scene", "./scripts/browse.test.ts", ...args], {
      cwd: path.join(repo, "backend"), env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" }, stdio: ["inherit", "pipe", "pipe"],
    });
    for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.setEncoding("utf8");
      stream.on("data", chunk => { output += chunk; target.write(chunk); });
    }
    child.once("error", reject);
    // Wait for both output pipes to drain before writing the timing report.
    child.once("close", code => resolve(code ?? 1));
  });
  const timings = { ...testTimings(output), durationMs: Date.now() - started, exitCode };
  const report = git(repo, "rev-parse", "--git-path", "check-reports/backend-tests.json");
  writeJson(path.resolve(repo, report), timings);
  console.log(`CHECK_TIMINGS ${JSON.stringify({ ...timings, report, slowest: timings.slowest })}`);
  if (exitCode !== 0) throw Object.assign(new Error("Backend tests failed"), { exitCode });
  if (timings.dominant.length) throw Object.assign(new Error("PERFORMANCE: a test took at least 30 seconds and half the measured test time; investigate before downstream merges"), { exitCode: 2 });
}

async function checks(mode) {
  const changed = mode === "all" ? null : git(root, "diff", "--cached", "--name-only").split("\n").filter(Boolean);
  const frontend = !changed || changed.some(name => !name.startsWith("backend/") && !name.startsWith("docs/") && !name.endsWith(".md"));
  const backend = !changed || changed.some(name => /^(backend\/|src\/sceneRules\/|src\/scene\/|scripts\/|\.githooks\/|package\.json$|yarn\.lock$)/.test(name));
  if (frontend || backend) await runCheck([process.execPath, "scripts/frontend.cjs", "setup"]);
  if (backend) {
    for (const name of ["typecheck", "test", "lint", "smoke"]) await runCheck(["bun", "run", name], { cwd: path.join(root, "backend") });
  }
  if (frontend) await runCheck([process.execPath, "scripts/frontend.cjs", "check"]);
}

module.exports = { fingerprint, runCheck, testTimings, writeJson };
if (require.main === module) {
  const mode = process.argv[2];
  const action = mode === "backend-test" ? backendTests(process.argv.slice(3)) :
    ["all", "staged"].includes(mode) ? checks(mode) : Promise.reject(new Error("Usage: node scripts/checks.cjs all|staged|backend-test [test flags]"));
  action.catch(error => { console.error(error.message); process.exitCode = error.exitCode || 1; });
}
