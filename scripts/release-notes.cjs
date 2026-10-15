const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

// The body of the GitHub release for a tag: its notes file without the title,
// with links made absolute at the tag, and the downloads.
function releaseNotes(tag, last, repository, repo = root) {
  const file = path.join(repo, "docs/releases", `${tag}.md`);
  if (!fs.existsSync(file)) throw new Error(`docs/releases/${tag}.md is missing; write the notes before tagging`);
  const source = fs.readFileSync(file, "utf8");
  if (/pending (release|verification|publication)/i.test(source)) throw new Error(`docs/releases/${tag}.md still says it is pending release`);
  const body = source.replace(/^# .*\n+/, "").replace(/\]\(([^)\s]+)\)/g, (link, target) => {
    if (/^([a-z]+:|#)/i.test(target)) return link;
    const resolved = path.posix.normalize(path.posix.join("docs/releases", target));
    return `](https://github.com/${repository}/blob/${tag}/${resolved})`;
  });
  return `${body.trimEnd()}

## Downloads

- Linux x64: \`owlbear-rodeo-linux-x64\`
- Windows x64: \`owlbear-rodeo-windows-x64.exe\`

Each executable includes the frontend and server. The release workflow checks startup, persistence and upgrading from ${last} on both operating systems before publication.
`;
}

module.exports = { releaseNotes };

if (require.main === module) {
  const [tag, last, repository] = process.argv.slice(2);
  if (!tag || !last || !repository) {
    console.error("usage: node scripts/release-notes.cjs <tag> <last release tag> <owner/repo>");
    process.exit(2);
  }
  try {
    process.stdout.write(releaseNotes(tag, last, repository));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
