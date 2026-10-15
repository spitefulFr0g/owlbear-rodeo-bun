const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { releaseNotes } = require("./release-notes.cjs");

function repoWith(notes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-notes-"));
  fs.mkdirSync(path.join(dir, "docs/releases"), { recursive: true });
  if (notes !== undefined) fs.writeFileSync(path.join(dir, "docs/releases/v1.0.0.md"), notes);
  return dir;
}

test("the release body drops the title, pins relative links to the tag and names the downloads", t => {
  const dir = repoWith("# v1.0.0: things\n\nSee the [guide](../hosting.md#backup), [notes](v0.9.0.md), [site](https://example.com) and [below](#up).\n");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const body = releaseNotes("v1.0.0", "v0.9.0", "owner/repo", dir);
  assert.match(body, /^See the \[guide\]\(https:\/\/github\.com\/owner\/repo\/blob\/v1\.0\.0\/docs\/hosting\.md#backup\), \[notes\]\(https:\/\/github\.com\/owner\/repo\/blob\/v1\.0\.0\/docs\/releases\/v0\.9\.0\.md\), \[site\]\(https:\/\/example\.com\) and \[below\]\(#up\)\.\n\n## Downloads\n/);
  assert.match(body, /upgrading from v0\.9\.0 on both operating systems/);
});

test("a tag without its notes file is refused", t => {
  const dir = repoWith(undefined);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => releaseNotes("v1.0.0", "v0.9.0", "owner/repo", dir), /v1\.0\.0\.md is missing/);
});

test("notes that still say they are pending release are refused", t => {
  const dir = repoWith("# v1.0.0\n\nRelease notes, pending release verification.\n");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => releaseNotes("v1.0.0", "v0.9.0", "owner/repo", dir), /still says it is pending release/);
});

test("a fix that mentions something pending is not refused", t => {
  const dir = repoWith("# v1.0.0\n\nA deleted room refuses the pending join.\n");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.match(releaseNotes("v1.0.0", "v0.9.0", "owner/repo", dir), /refuses the pending join/);
});
