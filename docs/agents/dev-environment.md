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

- run `node scripts/frontend.cjs setup` at the root, then
  `bun install --frozen-lockfile` in `backend/`.

Frontend setup links the main checkout's dependencies when `yarn.lock` and
the package dependency declarations match. Checks and the frontend build
repeat that validation. When they differ, remove the borrowed link and
install locally with Yarn.

## Checks

`.githooks/pre-commit` runs what CI runs for the half a commit touches, and
prints only on failure. A fresh clone turns it on with
`git config core.hooksPath .githooks`; worktrees share that setting.

Frontend checks end with a Vite build, so a broken import fails the commit.

Vitest runs the helper tests in `src/helpers` in a browser environment.
Running those tests with Bun alone omits browser globals such as localStorage.
Bun runs the tests in `src/scene` and `src/sceneRules`, from `backend/`.

Tests hash passwords at the lowest bcrypt cost (`backend/scripts/test-setup.ts`).

Tests run on a test clock, so they never run the runtime's own timers.
`bun run smoke` in `backend/` does: it starts the real server, joins a room as
the GM, restarts, and fails on anything unexpected on stderr. Give it a
compiled executable to check a release: `bun scripts/smoke.ts dist/<file>`.
Add `--from <the last release's executable>` to check the upgrade: the old
executable makes the data and the new one opens it.

## Releasing

Set the version in both `package.json` files, merge, then push the tag
`v<version>` to the fork. `.github/workflows/release.yml` builds both
executables, runs the smoke and upgrade checks on Linux and Windows, and
leaves a draft release holding them. Write the notes on the draft and publish
it. A manual run of the workflow makes a draft named `trial-<n>` with no tag;
delete it after.

## Seeing it in a browser

Start the backend on a spare port with its own data directory:
`bun src/index.ts --port 9100 --data-dir <temp dir>`. A fresh data directory
opens on the setup form.

For changes to held drags, resizes, tool switching or authoritative-update
reconciliation, run the [held interaction verification command](verification.md).
