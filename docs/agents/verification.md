# Held interaction verification

Run this command when changing the lifetime of canvas drags or transforms, including reconciliation after scene updates and cancellation when tools or permissions change. It checks the rendered application and committed state through a second GM connection. Helper permission tests alone cannot establish these behaviours.

## Prepare

Use a worktree with frontend and backend dependencies set up as described in [Dev environment](dev-environment.md). Build its frontend with `bun run build:frontend` in `backend/`.

The command requires T3's collaborative preview tools and an incognito profile. It creates its own tab, temporary data directory, account and room. It drives DOM mouse events, observes rendered Konva geometry, and uses public HTTP/socket messages for authoritative changes. A marker in each peer change batch provides a browser rendering barrier; there are no guessed sleeps between a competing change and its assertion.

## Run in Codex code mode

```js
// @exec: {"yield_time_ms": 1000, "max_output_tokens": 1000}
const repo = "/absolute/path/to/worktree";
const source = (await tools.exec_command({
  cmd: "cat " + repo + "/scripts/verify-held-interactions.js",
  max_output_tokens: 14000,
})).output;
const verifier = eval(source)(tools);
const result = await verifier.run({
  repo,
  report: "/tmp/held-interactions-result.json",
  onProgress: notify,
});
text(result);
if (result.status !== "pass") throw new Error(result.error);
```

If the command yields, resume the returned cell with `functions.wait`. The result must say `pass` for all six cases:

- A held move survives another GM's committed drop, continues and commits on release.
- A held resize survives that commit, stays active and commits on release.
- Switching tools cancels a held move and restores the saved geometry.
- Switching tools cancels a held resize and restores the saved geometry.
- Deletion ends the held interaction; releasing cannot recreate the item.
- Locking an item while its ordinary player holds it restores saved geometry and prevents the later release from moving it.

The fixture closes its sockets and server, removes its temporary data and closes its owned tab. A failure report identifies the case; it never edits existing room data. The fixture control endpoint binds to loopback and requires an ephemeral bearer token stored only in its temporary configuration file.

## Prove the check detects a regression

In an isolated worktree, substitute the pre-fix `SceneSelection.tsx`, rebuild, and run the same command. It must fail the competing-move case. Restore the source and rebuild before committing. The original baseline is commit `45d96ff`; the intermediate repair at `c1c501b` also lacks the final tool-switch cleanup from `bc64d70`. Keep the negative-control report with the passing report so the reviewer can tell the check exercises the lifecycle fault.

This focused command does not replace the full live-play story matrix, platform checks, or upgrade smoke checks.
