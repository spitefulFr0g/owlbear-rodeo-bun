# Dev environment

What the scripts and config do not say on their own. The commands themselves
are in `backend/package.json`, the root `package.json` and `.github/workflows/`.

## Two halves

- **Frontend**: the repo root. Create React App 4, which needs Node 16 and Yarn.
- **Backend**: `backend/`. Bun, at the version `.github/workflows/backend.yml` pins.

The backend serves an embedded copy of the frontend's `build/`. `start`,
`dev`, `test` and `typecheck` embed whatever `build/` holds at that moment,
so an interface change shows in the running app only after
`bun run build:frontend` in `backend/`. That build runs in Docker and takes
one to ten minutes, the long end when it installs dependencies first.

## Worktrees

Agent worktrees go in `.claude/worktrees/<name>`, which is ignored. In a new one:

- run `bun install --frozen-lockfile` in `backend/`;
- leave the frontend's `node_modules` out. `bun run build:frontend` and
  `.githooks/frontend-typecheck` both borrow the main checkout's, as long as
  `yarn.lock` is unchanged.

## Checks

`.githooks/pre-commit` runs what CI runs for the half a commit touches, and
prints only on failure. A fresh clone turns it on with
`git config core.hooksPath .githooks`; worktrees share that setting.

Tests hash passwords at the lowest bcrypt cost (`backend/scripts/test-setup.ts`).

Tests run on a test clock, so they never run the runtime's own timers.
`bun run smoke` in `backend/` does: it starts the real server, joins a room as
the GM, restarts, and fails on anything unexpected on stderr. Give it a
compiled executable to check a release: `bun scripts/smoke.ts dist/<file>`.

## Seeing it in a browser

Start the backend on a spare port with its own data directory:
`bun src/index.ts --port 9100 --data-dir <temp dir>`. A fresh data directory
opens on the setup form.
