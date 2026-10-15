const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { runCheck, testTimings } = require("./checks.cjs");

test("verification reuse requires the same source, index, environment, build and dependency versions", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-receipt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, "repo"); fs.mkdirSync(repo);
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init");
  fs.writeFileSync(path.join(repo, ".gitignore"), "build/\nnode_modules/\n");
  fs.writeFileSync(path.join(repo, "source"), "initial"); git("add", ".");
  const counter = path.join(dir, "executions");
  const command = [process.execPath, "-e", `require('fs').appendFileSync(${JSON.stringify(counter)}, 'x')`];
  const options = { repo, cwd: repo, receiptFile: path.join(dir, "receipt.json"), env: { ...process.env }, quiet: true };
  const count = () => fs.readFileSync(counter, "utf8").length;
  await runCheck(command, options); await runCheck(command, options);
  assert.equal(count(), 1);
  fs.writeFileSync(path.join(repo, "source"), "unstaged"); await runCheck(command, options);
  assert.equal(count(), 2);
  git("add", "source"); await runCheck(command, options); assert.equal(count(), 3);
  fs.writeFileSync(path.join(repo, "new-source"), "untracked"); await runCheck(command, options); assert.equal(count(), 4);
  options.env.CHECK_TEST_VARIANT = "changed"; await runCheck(command, options); assert.equal(count(), 5);
  fs.mkdirSync(path.join(repo, "build")); fs.writeFileSync(path.join(repo, "build", "app.js"), "changed");
  await runCheck(command, options); assert.equal(count(), 6);
  const pkg = path.join(repo, "node_modules", "fixture"); fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), '{"version":"1"}'); await runCheck(command, options); assert.equal(count(), 7);
  fs.writeFileSync(path.join(pkg, "package.json"), '{"version":"2"}'); await runCheck(command, options); assert.equal(count(), 8);
  fs.unlinkSync(path.join(repo, "source")); await runCheck(command, options); assert.equal(count(), 9);
  await runCheck(command, options); assert.equal(count(), 9);
  fs.chmodSync(path.join(repo, "new-source"), 0o755); await runCheck(command, options); assert.equal(count(), 10);
});

test("failed checks and checks that edit their source cannot create reusable receipts", async t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "check-failed-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  execFileSync("git", ["init"], { cwd: repo, stdio: "pipe" });
  const receiptFile = path.join(repo, ".git", "receipt.json");
  const options = { repo, cwd: repo, receiptFile, quiet: true };
  await assert.rejects(runCheck([process.execPath, "-e", "process.exit(7)"], options), { exitCode: 7 });
  assert.equal(fs.existsSync(receiptFile), false);
  const command = [process.execPath, "-e", "require('fs').appendFileSync('source', 'x')"];
  await runCheck(command, options); await runCheck(command, options);
  assert.equal(fs.readFileSync(path.join(repo, "source"), "utf8"), "xx");
  assert.equal(fs.existsSync(receiptFile), false);
});

test("changing a command's local dotenv file reruns verification and exposes its failure", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-dotenv-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, "repo"); fs.mkdirSync(repo);
  const cwd = path.join(repo, "backend"); fs.mkdirSync(cwd);
  execFileSync("git", ["init"], { cwd: repo, stdio: "pipe" });
  fs.writeFileSync(path.join(repo, ".gitignore"), ".env*\n");
  const dotenv = path.join(cwd, ".env");
  fs.writeFileSync(dotenv, "RETRO_CHECK_DOTENV=good\n");
  const env = { ...process.env };
  delete env.RETRO_CHECK_DOTENV;
  // Node rather than Bun, which the frontend job does not install. Node reads
  // the dotenv file only when told to, as Bun does by default.
  const command = [process.execPath, "--env-file=.env", "-e", "if (process.env.RETRO_CHECK_DOTENV !== 'good') process.exit(7)"];
  const options = { repo, cwd, env, receiptFile: path.join(dir, "receipt.json"), quiet: true };
  await runCheck(command, options);
  fs.writeFileSync(dotenv, "RETRO_CHECK_DOTENV=bad\n");
  await assert.rejects(runCheck(command, options), { exitCode: 7 });
});

test("timing summaries expose dominant slow tests while preserving units and failed cases", () => {
  const report = testTimings("src/library.test.ts:\n(pass) count caps [418432.85ms]\n(pass) remaining behaviour [28000.00ms]\n(fail) tiny [10.00µs]\n(pass) no duration printed\n");
  assert.equal(report.dominant[0].name, "count caps");
  assert.equal(report.dominant[0].file, "src/library.test.ts");
  assert.equal(report.testCount, 4);
  assert.equal(report.timedTestCount, 3);
  assert.equal(report.slowest[2].durationMs, 0.01);
  assert.deepEqual(testTimings("(pass) caps [11997.91ms]\n(pass) a [10000ms]\n(pass) b [10000ms]\n(pass) c [10000ms]\n").dominant, []);
});

test("a real commit hook reuses prior verification despite Git's hook environment", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-hook-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, "repo"); fs.mkdirSync(repo);
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init"); git("config", "user.name", "Check fixture"); git("config", "user.email", "fixture@example.invalid");
  const counter = path.join(dir, "executions");
  const command = [process.execPath, "-e", `require('fs').appendFileSync(${JSON.stringify(counter)}, 'x')`];
  const runner = path.join(repo, "verify.cjs");
  fs.writeFileSync(runner, `require(${JSON.stringify(path.join(__dirname, "checks.cjs"))}).runCheck(${JSON.stringify(command)}, {repo: process.cwd(), cwd: process.cwd(), quiet: true}).catch(e => {console.error(e); process.exit(1)});`);
  git("add", ".");
  const hook = path.join(repo, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, `#!/bin/sh\nexec '${process.execPath}' verify.cjs\n`, { mode: 0o755 });
  git("config", "core.hooksPath", path.dirname(hook));
  const env = { ...process.env, OWLBEAR_CHECK_RECEIPT: path.join(dir, "receipt.json") };
  execFileSync(process.execPath, [runner], { cwd: repo, env });
  execFileSync("git", ["commit", "-m", "verified"], { cwd: repo, env, stdio: "pipe" });
  assert.equal(fs.readFileSync(counter, "utf8"), "x");
});

test("the maintained test command rejects slow passing tests and preserves test failures", t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "check-timing-cli-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  execFileSync("git", ["init"], { cwd: repo, stdio: "pipe" });
  for (const name of ["scripts", "backend", "bin"]) fs.mkdirSync(path.join(repo, name));
  const script = path.join(repo, "scripts", "checks.cjs");
  fs.copyFileSync(path.join(__dirname, "checks.cjs"), script);
  const fakeBun = path.join(repo, "bin", "bun");
  const env = { ...process.env, PATH: path.join(repo, "bin") + path.delimiter + process.env.PATH };
  function run(output, status) {
    fs.writeFileSync(fakeBun, `#!/bin/sh\ncat <<'RESULT'\n${output}\nRESULT\nexit ${status}\n`, { mode: 0o755 });
    try { execFileSync(process.execPath, [script, "backend-test"], { cwd: repo, env, stdio: "pipe" }); return 0; }
    catch (error) { return error.status; }
  }
  assert.equal(run("(pass) count caps [418432.85ms]\n(pass) remaining [28000ms]", 0), 2);
  const report = JSON.parse(fs.readFileSync(path.join(repo, ".git", "check-reports", "backend-tests.json"), "utf8"));
  assert.equal(report.dominant[0].name, "count caps");
  assert.equal(run("(fail) count caps [418432.85ms]", 7), 7);
  assert.equal(run("(pass) count caps [12000ms]", 0), 0);
});
