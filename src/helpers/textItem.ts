export type TextSize = "small" | "medium" | "large" | "huge";

export const textSizes: TextSize[] = ["small", "medium", "large", "huge"];

/** A line's height in fifths of a grid cell; medium reads like a note's text of a word or two. */
const fifthsPerLine: Record<TextSize, number> = { small: 1, medium: 2, large: 4, huge: 8 };

/** A text item's size: the height of a line in world units. */
export function textLineHeight(size: TextSize, unitsPerCell: number): number {
  return (fifthsPerLine[size] * unitsPerCell) / 5;
}

/** The size whose line height is nearest, compared by ratio, at this cell. */
export function textSizeOf(lineHeight: number, unitsPerCell: number): TextSize {
  const distance = (size: TextSize) =>
    Math.abs(Math.log(lineHeight / textLineHeight(size, unitsPerCell)));
  return textSizes.reduce((nearest, size) => distance(size) < distance(nearest) ? size : nearest);
}
