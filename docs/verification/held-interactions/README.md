# Held interaction verifier evidence

The command in [verification.md](../../agents/verification.md) was exercised against the released v0.4.0 source and two historical versions of `SceneSelection.tsx`, each rebuilt before its run. These are browser checks against the rendered application plus a second GM using public HTTP/socket messages, not assertions against a component implementation.

| Source | Result | Evidence |
| --- | --- | --- |
| v0.4.0 (`9a95bab`) | All six cases pass | [pass.json](pass.json) |
| Original lifecycle (`45d96ff`) | Competing commit cancels held move | [old-lifecycle.json](old-lifecycle.json) |
| Intermediate repair (`c1c501b`) | First three cases pass; switching tools leaves held resize geometry | [intermediate-cleanup.json](intermediate-cleanup.json) |

The fixed source was restored and rebuilt after the negative controls. The passing cases cover competing move and resize, tool-switch move and resize, deletion, and ordinary-player permission loss. The fixture and its tabs were closed after each run.
