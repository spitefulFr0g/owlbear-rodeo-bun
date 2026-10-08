---
status: accepted
---

# A hidden item is seen by its creator and the GM

The reference gives every item a `visible` flag that means one thing: the GM has hidden this item from the players. We wanted something the reference does not have, which is that any player can write notes for themselves, while only the GM and trusted players can put a note in front of the whole table. We decided to use the one flag for both. A hidden item is sent to its creator and to the GM and to nobody else. New notes and text start hidden for everyone. A player who is not trusted cannot change the flag on their own notes and text, so theirs stay hidden.

## Considered options

- **A separate "private" flag beside `visible`.** Rejected because it gives two flags with four combinations and two server filters for what is one question: who receives this item.
- **Hidden notes seen by their author only.** Rejected because the server would then hold content in a room that its GM cannot see or remove.
- **No notes at all for players who are not trusted.** Rejected by the maintainer: writing a note for yourself harms nobody.
- **New notes shared by default.** Rejected because sharing by accident is worse than having to press a button to share.

## Consequences

- The server filters hidden items per connection by creator and role. A client is never sent a hidden item it may not see.
- A token the GM hides is hidden by the same rule, so the GM is its creator and no player receives it.
- The rule covers both notes and text typed on the canvas, so the text tool cannot be used to get around it.
- A cast display is not a creator and not the GM, so it never shows hidden items.
- Being allowed to show an item is part of the trusted player's permissions, which the roles and permissions ticket defines.

Full detail: [Screen grid, fog, drawing, text and presentation features (sections H, I, K, L, M)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/18).
