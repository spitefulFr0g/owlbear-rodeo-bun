# Coding standards

Read at review. Each rule is a judgement no check makes; what a check can
decide lives in the checks (`.githooks/pre-commit`, `.github/workflows/`).

## Server (`backend/`)

- **Tests go through the whole server.** A test starts it with
  `startTestServer()` from `backend/src/testing/serverHelpers.ts` and talks to
  it with `fetch` and the socket client, the way a browser does. It opens no
  database and calls no module inside the server.
- **Time rules are tested by moving the test clock**, with no wall-clock wait.
- **One executable.** The server stays a single `bun build --compile` file for
  Linux and Windows, so a new dependency has no native part. SQLite is
  `bun:sqlite`.

## Interface (`src/`)

- **No page or component tests.** Logic worth a test is a pure function in
  `src/helpers/` with its test beside it, like `displayView.test.ts`.

## Both

- **Glossary words.** Names in code and tests, and wording a person reads, use
  the terms in `GLOSSARY.md`.
- **Tests are named for the behaviour they prove.**
- **Found outside your task.** A defect seen in code the change does not touch
  is reported in the review or filed as an issue, where someone will act on it.
