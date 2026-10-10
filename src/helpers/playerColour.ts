export const playerColours = ["blue", "orange", "red", "yellow", "purple", "green", "pink", "teal"] as const;
export type PlayerColour = typeof playerColours[number];

export function isPlayerColour(value: unknown): value is PlayerColour {
  return playerColours.some((colour) => colour === value);
}

export function rememberedColour(): PlayerColour | undefined {
  try {
    const colour = localStorage.getItem("owlbear.playerColour");
    return isPlayerColour(colour) ? colour : undefined;
  } catch {
    return undefined;
  }
}

export function rememberColour(colour: PlayerColour) {
  try {
    localStorage.setItem("owlbear.playerColour", colour);
  } catch {
    // The choice still works for this visit when browser storage is disabled.
  }
}
