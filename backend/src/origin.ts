/**
 * Decide whether a browser request may talk to this server.
 *
 * Same-origin requests are always allowed, since the server hosts the
 * frontend itself. `allow` optionally admits additional origins, for example
 * a frontend dev server on another port.
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allow: RegExp | null
): boolean {
  if (!origin) {
    // Not a cross-origin browser request
    return true;
  }
  if (allow?.test(origin)) {
    return true;
  }
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}
