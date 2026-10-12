# #130 integrated verification

## Result and provenance

Checked integration `1a6e90c511ac147de5bad0376643c2ee4db57af1` on `ticket/122-verify`, before main merge. Main merge and release remain the maintainer's actions.

The earlier Codex attempt did perform substantial work before its terminal capacity error: its durable timeline contains browser results and the `shots/verify-*` captures. This retry inspected that partial work, retained its smoke assertion, reran all checks, and continued browser inspection through T3. Recovered screenshots are identified below rather than attributed to this retry.

Fresh room: `gD9TDVx1OQYjOVKw`, server port 9160, isolated disposable data `/tmp/opencode/owlbear-verify-130`. GM1 `Tribal Warrior` (tab_23), GM2 `Bandit Captain` (tab_24), trusted `Earth Elemental` (tab_25), player `Raven` (tab_26), cast (tab_27). Each was opened with `profileId: incognito`, `reuseExistingTab: false`; a localStorage probe confirmed that two incognito tabs at the same origin do not share storage. GM2 signed in independently; player/trusted stayed unsigned-in. The cast was a display connection and had no party entry.

Browser work used T3 semantic clicks, keyboard shortcuts, snapshots, and individual DOM mouse/pointer events for held canvas gestures unavailable through the click tool. Konva output was inspected to read coordinates, colours and labels. No automated page/component/browser test suite was added. `logs/verify-fixture-retry.ts` only seeds fixtures and changes grid settings through the public socket; it does not drive or assert against pages.

**Result:** story 11 fails when another connection commits during a local hold. Other checked cases below passed. Security/persistence/structural stories are explicitly distinguished from visual hand checks; whole-server tests supply the adversarial cases that ordinary UI controls cannot originate. Browser visual coverage is finite sampled frames, not a hardware/device performance benchmark.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| `node scripts/frontend.cjs setup` and `node scripts/frontend.cjs check` | PASS; 11 Jest suites, 70 tests, frontend type/lint checks | `logs/verify-frontend.log` |
| `bun install --frozen-lockfile`, `bun run typecheck` | PASS | `logs/verify-typecheck-retry.log` |
| `bun run test` | PASS; 857 pass, 0 fail | `logs/verify-tests-retry.log` |
| `bun run lint` | PASS; 0 errors, 459 warnings | `logs/verify-lint-retry.log` |
| `bun run smoke` | PASS | `logs/verify-smoke-retry.log` |
| `bun run build:frontend`, `bun run build linux-x64` | PASS | `logs/verify-build-retry.log`, `logs/verify-compile-retry.log` |
| `bun scripts/smoke.ts dist/owlbear-rodeo-linux-x64` | PASS | `logs/verify-compiled-retry.log` |
| `bun scripts/smoke.ts dist/owlbear-rodeo-linux-x64 --from <actual release executable>` | PASS, including movementMode true after upgrade | `logs/verify-upgrade-retry.log` |

Upgrade artifact: fork release [v0.3.0](https://github.com/spitefulFr0g/owlbear-rodeo-bun/releases/tag/v0.3.0), Linux asset `owlbear-rodeo-linux-x64`, release asset id 630087060, 107922912 bytes. Local path `artifacts/v0.3.0/owlbear-rodeo-linux-x64`. SHA-256 `b9050f731cbb1294809d5c9ae4846f8d90f1c3a03aefb43bea4c3c078dbe83d2`, matching `gh release view` metadata. This is the released executable, not a locally rebuilt approximation. The old executable created the upgrade data; the newly compiled executable reopened it. The retained smoke change adds the missing explicit movement-mode default assertion.

## Grid/movement matrix

All five fresh contexts were connected for the scene/grid observations. Recovered ruler/movement captures cover the six combinations as well.

| Grid | Movement on | Movement off |
| --- | --- | --- |
| Square | Player move and ruler both 5ft on all screens; `verify-square-player-drag-cast.png`, `verify-retry-square-ruler-{player,cast}.png` | Held GM drag continues at `(600,350)` without a movement label after settings update; recovered `verify-square-off-{player,cast}.png` |
| Hex vertical | Fresh move `(450,350)` to `(600,500)` reads 10ft, ruler over same endpoints reads 10ft; `verify-retry-vertical-drag-cast.png`; recovered `verify-vertical-on-*.png` | Held drag stays `(600,500)` while its movement label disappears; ruler still reads 10ft; recovered `verify-vertical-off-*.png` |
| Hex horizontal | Fresh move `(450,500)` to `(600,350)` reads 5ft for trusted/player/cast; `verify-retry-horizontal-drag-cast.png`; recovered `verify-horizontal-on-*.png` includes ruler comparison | Held drag stays `(600,350)` without the distance after off; recovered `verify-horizontal-off-*.png` |

The fresh vertical/horizontal fixtures used snap off so endpoints could be repeated precisely. Recovered original grid captures and shared distance tests additionally cover snapped ruler semantics. The shared tests cover all four measurement types on all three grids.

## Numbered stories

Evidence paths below are relative to these notes. `R` means recovered prior browser inspection/captures at the same integration tip; `B` means this retry's T3 browser inspection; `S` means whole-server/shared-rule checks and inspected implementation. A passed S-only story is not presented as a visual browser observation.

| # | Result | Evidence / observation |
| --- | --- | --- |
| 1 | PASS B/R | Player drag reaches both GMs, trusted and cast; fresh 5ft move and recovered square captures. |
| 2 | PASS B/R | GM drag reaches players and cast; fresh horizontal move and recovered mount/group captures. |
| 3 | PASS R | Live resize and 90-degree rotation; `shots/verify-resize-{gm,player,cast}.png`, `verify-rotate-*.png`. |
| 4 | PASS R | Selected group retains formation, one distance; `shots/verify-group-player.png`. |
| 5 | PASS R | Mount carries Rider and Hat; `shots/verify-mount-{gm,cast}.png`. |
| 6 | PASS R/S | Prior timeline records interpolated frame samples between updates; shared interpolation checks pass. No hardware smoothness benchmark is claimed. |
| 7 | PASS B/R | Released player move stays at committed location, overlay/label clears; prior landing frame samples showed no backwards step. |
| 8 | PASS B/S | Trusted drag previews Hero at `(900,200)` then disconnect restores `(750,350)` on cast. Refused/unauthorized packets covered by public-server tests. |
| 9 | PASS B/R | Local held move/resize/rotate retains direct gesture response; preview sends do not block it. |
| 10 | PASS B/R | GM2 can pick up Hero while GM1 holds it; no remote selection/lock. `shots/verify-competing-*.png`. |
| 11 | FAIL B | Local holds beat remote previews, but GM2's committed drop cancels GM1's still-held drag; see fault below and `shots/verify-retry-concurrent-commit-failure.png`. |
| 12 | PASS B/S | Disconnect removes ruler, drag and owner presence; abandoned Hero returns to authoritative position. |
| 13 | PASS S/B | Ephemeral live traffic leaves no stored scene change; restart tests pass. Only released drops count; abandoned drag restores unchanged state. |
| 14 | PASS B/R | Player ruler appears to all five contexts; `shots/verify-retry-square-ruler-player.png`, recovered `verify-square-ruler-*.png`. |
| 15 | PASS B/R | Both GMs read player's 5ft/10ft rulers. |
| 16 | PASS B/R | Ruler colour comes from owner's presence; fresh orange ruler stroke `rgb(255,116,51)` observed on frozen cast. |
| 17 | PASS B/R/S | Same labels across clients; same endpoints agree on square and both hex grids; shared measurement tables pass. |
| 18 | PASS B/R | Release removes ruler; later scene changes/disconnect also clear it. |
| 19 | PASS R/S | Trusted ruler on view-only scene; `shots/verify-view-only-ruler.png`; public routing tests cover ordinary players. |
| 20 | PASS B | Pointer Tool Q, held point and movement reach cast; red pointer visually inspected; `shots/verify-retry-pointer-cast.png`. |
| 21 | PASS S | Public socket tests spoof sender identity and confirm server connection id on all live kinds. |
| 22 | PASS B/S | GM2 red presence yields red cast pointer; presence lookup inspected. |
| 23 | PASS B/R | Player reads own 5ft movement label during held drag. |
| 24 | PASS B/R | Both GMs read the same player's distance. |
| 25 | PASS B/R | Straight start-to-current line and label visually inspected on cast. |
| 26 | PASS B/R/S | Same-endpoint move/ruler comparisons, including fresh vertical 10ft; all measurement/grid tests pass. |
| 27 | PASS R/S | Scene Controls switch checked in paired UI evidence; scene setting route inspected and tested. `shots/movement-ui-controls.png`. |
| 28 | PASS S | New/missing-flag scenes default on; actual released v0.3.0 upgrade explicitly asserts on. |
| 29 | PASS B/R | Turning off during hold drops label while drag remains live on all grids. |
| 30 | PASS S | Public-server tests confirm GM setting save/restart and duplicate copies flag. |
| 31 | PASS R/S | Resize/rotation captures contain no movement distance; drawing drag/token-choice pure checks distinguish non-tokens. |
| 32 | PASS R/S | Group/mount captures show one label; token-order/fallback tests pass. |
| 33 | PASS B/R/S | Fresh hidden Secret previews `(900,650)` to GM2, absent from player/cast; recovered `verify-hidden-*.png`. |
| 34 | PASS R/S | Mixed drag filters hidden entry only, shown token still moves; `shots/verify-mixed-*.png`. |
| 35 | PASS R/S | Private note moves on both owner connections and GMs, absent from trusted/cast; `shots/verify-private-note-*.png`. |
| 36 | PASS S | Public-server locked/map/unauthorized drag tests; ordinary UI cannot originate prohibited drag. |
| 37 | PASS B/R/S | Waiting players have only pointer/measure keyboard gestures; view-only and welcome sender restrictions tested publicly. |
| 38 | PASS S | Shared permission tables and server drag filtering cover switches, Owner Only, locks and roles. |
| 39 | PASS B/S | GM2 private canvas has no open-scene 10ft ruler, only own 15ft ruler; scene routing tests cover all kinds. |
| 40 | PASS B/S | Private GM2 ruler does not add a mark to player/cast; forged scene requests covered by public-server tests. |
| 41 | PASS B | Private GM2 sees no player/open-scene ruler. |
| 42 | PASS B/R | Both GMs receive other's drag/ruler/pointer when sharing scene. |
| 43 | PASS B | Player ruler remains 10ft on open scene while GM2 prepares privately. |
| 44 | PASS B | Show to players clears held old-scene rulers on player, GM sender and cast; fresh destination canvases empty. |
| 45 | PASS B/S | GM scene departure clears old pointer; authoritative routing cleanup tested for every live kind. |
| 46 | PASS B | Outside session, M on welcome scene sends player's 20ft ruler to cast; Q is supplied by same interactive canvas. `shots/verify-retry-welcome-live.png`. |
| 47 | PASS B | GM welcome drag reaches cast, Hero preview `(750,350)`, while waiting player's ruler remains; same capture. |
| 48 | PASS B/S | Removing welcome assignment gives default screen, no stage/tools/live marks to player/cast; `shots/verify-retry-default-welcome.png`, no-scene routing tests. |
| 49 | PASS B/R | Four participant roles/names/colour dots, two GM entries, no cast entry, inspected in fresh party lists. |
| 50 | PASS B/R | Player sees only `Viewing another scene`; `shots/verify-retry-elsewhere-player.png`. |
| 51 | PASS B/S | Player party contains no private scene name; public projection tests assert no id/name in packet. |
| 52 | PASS B/R | GM1 sees `Viewing: Private preparation`; `shots/verify-retry-elsewhere-gm.png`. |
| 53 | PASS B/S | End session with GM2 still privately preparing removes player elsewhere mark; fresh default welcome party inspected. |
| 54 | PASS B/S | Server roles shown correctly, trusted mark refreshed after GM click; spoof-role public tests pass. |
| 55 | PASS B | Player's shared d20 result 5 reaches private-preparation GM2; `shots/verify-retry-preparation-dice-timer.png`. |
| 56 | PASS B | Player five-minute progress timer reaches GM2 on private scene, `max=300000`, value decreases; same capture. |
| 57 | PASS B/S | Initial unshared d20 result stayed local; appeared at GM only after Share Dice Rolls; sanitization tests pass. |
| 58 | PASS B/S | Navigating owner out removes roll, timer (`progress` count 0) and presence from both GMs; persistence tests pass. |
| 59 | PASS B | Add D20, share toggle, timer form/start and countdown progress work in running app. |
| 60 | PASS B/S | Mark Earth Elemental trusted changes its server role and GM button to Unmark; role/revocation tests pass. |
| 61 | PASS B/R | Cast draws player/GM rulers, pointer and drags; fresh pointer, square/hex and recovered resize/group shots. |
| 62 | PASS B/R | Cast movement label equals player's/GM's on square and hex grids. |
| 63 | PASS B/R/S | Hidden Secret absent while GM2 receives its drag; recovered hidden/mixed/private-note captures. |
| 64 | PASS B/S | Private GM ruler absent from cast; routing tests verify all kinds. |
| 65 | PASS B/R | Fresh frozen cast receives ruler and red pointer; recovered `shots/verify-frozen-ruler.png`. |
| 66 | PASS B/S | Cast has no interface/party entry; public tests refuse live/presence from display role. |
| 67 | PASS S | Malformed/oversized family and presence packets refused through whole-server tests. |
| 68 | PASS S | 200-message/second per-connection cap checked by moving test clock; shared cap inspected. |
| 69 | PASS S | Whole-server restart after live traffic retains room unchanged; never persisted. |
| 70 | PASS S | Shared dragFrom/dragFor call mayChange/visibleTo; role/hidden tables and public outputs tested. |
| 71 | PASS S | Existing step 6/8 suites pass; wire changes/snapshots/answers retained except movement setting. |
| 72 | PASS S/B | `live` kind family has common scene/identity/validation/routing, all three seen in browser. |
| 73 | PASS S/B | Tools hand state to shared throttled sender; tool registry retained; individual tool gestures verified. |

## Fault requiring dispatcher triage

Stable existing id: **selection-drag-dropped-on-scene-change** (`DEFECTS.md`). Story 11 fails beyond the preview-only overlap case.

Fresh reproduction: GM1 drags Hero from `(750,350)` to `(900,200)` and keeps its mouse held. GM2 picks up the same remotely previewed Hero and holds it at `(450,500)`. GM1 continues to render `(900,200)`, correctly overriding the remote preview. GM2 releases; **without GM1 releasing**, GM1 immediately renders `(450,500)` and loses its held interaction. `shots/verify-retry-concurrent-commit-failure.png` captures the post-commit canvas. This is the same existing item-store interaction teardown at `src/components/scene/SceneSelection.tsx:125` (the effect recreates on authoritative item-store changes), not a movement setting failure.

This requires reconciling held node lifetimes with authoritative item replacement, deletion, permission changes and refused drops, plus new meaningful pure behavioural checks. It is larger than the verification worker's small-fix scope. It is tracked as [#132](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/132) with the `needs-triage` label and linked from #130. The fault-linked acceptance criterion is met; the lifecycle repair remains open for follow-up.

**pre-existing-eslint-warnings** remains open: lint passes with 459 warnings, 0 errors; `logs/verify-lint-retry.log`. Reuse the existing stable id rather than silently treating warnings as new defects.

## Exact proposed #130 comment

The dispatcher posted the verification summary and story results on #130, linked issue #132, and attached this report and its captures to the PR branch.

## Completion

Committed retained upgrade smoke assertion as `3c2c7d75af81e68bc149b7cce1fbfa4323989ea3` on `ticket/122-verify`, with configured author and OpenAI Codex co-author attribution. Pre-commit checks passed (`logs/verify-commit-retry.log`). The dispatcher merged that assertion and published this report and captures in the PR branch, then created issue #132 and commented on #130. Closed the retry's browser tabs and stopped its port-9160 server; inherited port-9150/proxy processes were not stopped.

## Follow-up: story 11 lifecycle repair

A frontend review of the integrated branch reproduced and repaired the story 11 fault in `SceneSelection`. A held move and resize now survive a competing authoritative drop; deletion, permission loss, refused drops and tool changes still cancel or restore the interaction safely. The review also added pure helper coverage for competing edits, deletion and permission loss.

Browser captures and detailed steps are in [`follow-up-frontend/`](follow-up-frontend/). The held move completed at `(950,250)` after the peer committed `(450,500)`. The held resize also remained active through the peer commit and released normally. A follow-up tool-switch check restored the authoritative position and scale and removed the transformer. See the review record at `/home/watermelon/.codex/spec-notes/owlbear-rodeo-bun-live-play/logs/review-frontend.md` for the full procedure and verification limits.

The original story 11 result above records the failure at the earlier verification tip. This follow-up passes the fault's acceptance case and resolves tracked issue [#132](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/132). The review passed frontend checks (73 tests), 858 backend/shared tests, production build, backend smoke and pre-commit checks. It did not repeat the full 73-story, five-connection or compiled-upgrade matrix.
