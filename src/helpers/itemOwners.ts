import { gmOwner } from "../sceneRules";
import { PartyState } from "../types/PartyState";

/** Owner identities are browser ids, even for signed-in players. */
export function itemOwners(party: PartyState, currentOwners: string[]) {
  const owners = [{ id: gmOwner, name: "The GM" }];
  for (const player of Object.values(party)) {
    if (!player.userId || player.role === "gm" ||
        owners.some(owner => owner.id === player.userId)) continue;
    owners.push({ id: player.userId, name: player.nickname || player.userId.slice(0, 8) });
  }
  for (const id of currentOwners) {
    if (!owners.some(owner => owner.id === id))
      owners.push({ id, name: id.slice(0, 8) });
  }
  return owners;
}
