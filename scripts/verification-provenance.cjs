const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

function provenance(repo = path.resolve(__dirname, "..")) {
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  if (git("status", "--porcelain")) {
    throw new Error("Browser verification requires a clean committed worktree");
  }
  const sourceSha = git("rev-parse", "HEAD");
  const directory = path.join(repo, "build");
  const files = [];
  function visit(folder) {
    for (const name of fs.readdirSync(folder)) {
      const file = path.join(folder, name);
      if (fs.statSync(file).isDirectory()) visit(file);
      else files.push(path.relative(directory, file).split(path.sep).join("/"));
    }
  }
  visit(directory);
  if (!files.length) throw new Error("Build is empty; build the verified source before browsing");
  const hash = crypto.createHash("sha256");
  for (const name of files.sort()) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(directory, name))).digest("hex");
    hash.update(JSON.stringify([name, digest]));
  }
  if (git("status", "--porcelain") || git("rev-parse", "HEAD") !== sourceSha) {
    throw new Error("Verified source changed while recording browser provenance");
  }
  return { sourceSha, sourceDirty: false, buildFingerprint: hash.digest("hex") };
}
module.exports = { provenance };
if (require.main === module) {
  try { console.log(JSON.stringify(provenance())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
