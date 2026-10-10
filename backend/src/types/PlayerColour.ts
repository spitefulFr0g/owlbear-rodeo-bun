export const playerColours = ["blue", "orange", "red", "yellow", "purple", "green", "pink", "teal"] as const;
export type PlayerColour = typeof playerColours[number];

export function isPlayerColour(value: unknown): value is PlayerColour {
  return typeof value === "string" && playerColours.some(color => color === value);
}
