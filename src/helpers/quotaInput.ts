// Quotas are decimal bytes, as in the shared library rules, so a megabyte here
// is a million bytes and matches what pretty-bytes shows
const bytesPerMegabyte = 1_000_000;

/** The bytes of a quota typed in megabytes, or undefined when it can't be one */
export function megabytesToBytes(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) return undefined;
  const bytes = Math.round(Number(trimmed) * bytesPerMegabyte);
  return Number.isSafeInteger(bytes) ? bytes : undefined;
}

/** A quota in megabytes, as a person would type it */
export function bytesToMegabytes(bytes: number): string {
  return String(bytes / bytesPerMegabyte);
}
