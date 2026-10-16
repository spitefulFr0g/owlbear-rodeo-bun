const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { provenance } = require("./verification-provenance.cjs");

test("browser provenance identifies the verified source and changes with built assets", t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "browser-provenance-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" }).toString().trim();
  git("init");
  fs.writeFileSync(path.join(repo, ".gitignore"), "build/\n");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "-m", "fixture");
  assert.throws(() => provenance(repo), /ENOENT/);
  fs.mkdirSync(path.join(repo, "build"));
  assert.throws(() => provenance(repo), /Build is empty/);
  fs.writeFileSync(path.join(repo, "build", "app.js"), "first build");
  const first = provenance(repo);
  assert.equal(first.sourceDirty, false);
  assert.equal(first.sourceSha, git("rev-parse", "HEAD"));
  assert.deepEqual(provenance(repo), first);
  fs.writeFileSync(path.join(repo, "build", "app.js"), "second build");
  assert.notEqual(provenance(repo).buildFingerprint, first.buildFingerprint);
  fs.writeFileSync(path.join(repo, "source"), "uncommitted change");
  assert.equal(provenance(repo).sourceDirty, true);
});
