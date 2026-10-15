type ShownData =
  | { type: "file"; file: string; thumbnail?: string; quality?: string; resolutions?: Record<string, string> }
  | { type: "default"; key: string };

/**
 * The stored file a map or token shows: its thumbnail when asked for, else
 * the copy its quality names, else the original. A default image shows its key.
 */
export function shownFile(data: ShownData, thumbnail = false): string | undefined {
  if (data.type === "default") return data.key;
  if (thumbnail && data.thumbnail) return data.thumbnail;
  if (data.resolutions && data.quality && data.quality !== "original") return data.resolutions[data.quality];
  return data.file;
}
