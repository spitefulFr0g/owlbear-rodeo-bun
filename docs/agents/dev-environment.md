# Dev environment

What the scripts and config do not say on their own. The commands themselves
are in `backend/package.json`, the root `package.json` and `.github/workflows/`.

## Two halves

- **Frontend**: the repo root. Vite, on Node 24 or newer. Yarn 1 comes through
  Corepack at the version `package.json` pins: run `corepack enable` once, or
  prefix each command as `corepack yarn`. Node 25 and later ship without
  Corepack; `npm install -g corepack` adds it.
- **Backend**: `backend/`. Bun, at the version `.github/workflows/backend.yml` pins.

The backend serves an embedded copy of the frontend's `build/`. `start`,
`dev`, `test` and `typecheck` embed whatever `build/` holds at that moment,
so an interface change shows in the running app only after
`bun run build:frontend` in `backend/`, which takes a few seconds.

`yarn start` at the root is the Vite dev server on port 3000, with hot reload.
It is a second origin: it talks to the backend named by `VITE_BROKER_URL` in
`.env`, port 9000, which is where `bun run dev` in `backend/` listens and the
only origin that script accepts. The built frontend talks to whatever server
served it.

Only variables named `VITE_*` reach the frontend, and `src/vite-env.d.ts`
types them. `VITE_VERSION` is not in a file: `vite.config.mjs` takes it from
`package.json`.

The build is not linted and not typechecked. `check:frontend` does both.

TypeScript stays at 4.3, which cannot read Vitest's own types, so `test` and
`expect` in the helper tests are typed by `@types/jest`.

## Worktrees

Worktrees may be inside or outside the main checkout. In a new one:

- run `node scripts/checks.cjs prepare` at the root. It prepares both halves
  with frozen lockfiles and validates any borrowed frontend dependencies.

Frontend setup links the main checkout's dependencies when `yarn.lock` and
the package dependency declarations match. Checks and the frontend build
repeat that validation. When they differ, `prepare` removes only the known
borrowed link and installs locally with Yarn. Other symlinks are preserved and reported as setup errors.
Checks validate dependencies without installing them.

## Checks

`.githooks/pre-commit` runs what CI runs for the half a commit touches, and
prints only on failure. Backend changes also run the real-server smoke check. A fresh clone turns it on with
`git config core.hooksPath .githooks`; worktrees share that setting.

`node scripts/checks.cjs all` runs the full integration checks. Guarded merges
can share a temporary `OWLBEAR_CHECK_RECEIPT` with their commit hook. Reuse
requires the same source contents, staged tree, command, build, environment
and installed dependency versions.

For a worker's final check and commit, stage the intended changes and run
`node scripts/checks.cjs commit -- -m "message"`. This runs the full checks and
shares temporary receipts with the hook, then removes them even on failure.
It refuses unstaged or untracked work. Direct `git commit` runs fresh checks.

Backend test runs print `CHECK_TIMINGS` and save a report beneath the worktree's
Git directory at `check-reports/backend-tests.json`. A test taking at least
30 seconds and half the measured test time fails the check for investigation,
even when its assertions pass. CI runs the backend tests about five times
slower than a local run, so a test that takes 6 seconds here can trip the
check there. A test that counts up to a large cap does not make every request:
it starts the server with a smaller cap through a `ServerOptions` field, as
`maxLibraryAssets` does, and the shared rule's own test keeps the real number.

Frontend checks end with a Vite build, so a broken import fails the commit.

Vitest runs the helper tests in `src/helpers` in a browser environment.
Running those tests with Bun alone omits browser globals such as localStorage.
Bun runs the tests in `src/scene` and `src/sceneRules`, from `backend/`.

Tests hash passwords at the lowest bcrypt cost (`backend/scripts/test-setup.ts`).

Server behaviour tests run on a test clock. Browser fixture lifecycle checks
start owned processes on the real clock.
`bun run smoke` in `backend/` does: it starts the real server, joins a room as
the GM, restarts, and fails on anything unexpected on stderr. Give it a
compiled executable to check a release: `bun scripts/smoke.ts dist/<file>`.
Add `--from <the last release's executable>` to check the upgrade: the old
executable makes the data, is stopped with a hard kill as Windows stops every
process, and the new one opens it.

## Releasing

Set the version in both `package.json` files, merge, then push the tag
`v<version>` to the fork. `.github/workflows/release.yml` builds both
executables, runs the smoke and upgrade checks on Linux and Windows, and
leaves a draft release holding them, with the notes taken from
`docs/releases/v<version>.md`. The tag fails the workflow when that file is
missing or still says it is pending release, so write the notes before
tagging. Check the notes on the draft and publish it. A manual run of the
workflow makes a draft named `trial-<n>` with no tag and placeholder notes;
delete it after.

No release waits on a hand check. Before a release, an agent checks
everything it can itself: the tests, the smoke and upgrade checks, and the
app in the preview browser for an interface change. A spec plans no hand
check, and its notes do not call a release pending one. The owner tests by
using it.

## Seeing it in a browser

`bun run browse` in `backend/` starts the server on an automatically assigned
port (`--port <number>` selects one) with a temporary data directory, an administrator and a room already
made, and prints the sign-in, the room link and the server's pid. The server
outlives the command; stop it with the `kill <pid>` it prints, since
`pkill -f` matches the shell running it and ends that too.
The fixture provisions through its own server address and removes its temporary
data when stopped. Startup failures stop the owned child and remove its data.

For changes to held drags, resizes, tool switching or authoritative-update
reconciliation, run the [held interaction verification command](verification.md).
