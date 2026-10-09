import { IncomingMessage } from "http";

function nearestForwardedValue(request: IncomingMessage, header: string): string | undefined {
  const value = request.headers[header];
  const values = (Array.isArray(value) ? value.join(",") : value)?.split(",");
  return values?.[values.length - 1]?.trim() || undefined;
}

/** Trust one proxy hop: it must append or replace the visitor's headers. */
export function clientAddress(request: IncomingMessage, behindProxy: boolean, directAddress = request.socket.remoteAddress): string | undefined {
  return (behindProxy ? nearestForwardedValue(request, "x-forwarded-for") : undefined)
    ?? directAddress;
}

export function requestIsHttps(request: IncomingMessage, behindProxy: boolean): boolean {
  const protocol = behindProxy ? nearestForwardedValue(request, "x-forwarded-proto") : undefined;
  return protocol ? protocol.toLowerCase() === "https" : "encrypted" in request.socket && request.socket.encrypted === true;
}
