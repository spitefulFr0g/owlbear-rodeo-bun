import type { Socket } from "socket.io-client";
import type { LibraryAsset, LibraryReservation, LibraryUploadResult } from "../../../src/sceneRules/library";

// Kept apart from serverHelpers, which loads the server and its embedded
// frontend, so the smoke check can use them against a built executable.

export const libraryMetadata = {
  name: "Image", type: "character" as const, width: 4, height: 2,
  outline: { type: "rect" as const, x: 0, y: 0, width: 4, height: 2 },
  defaults: { defaultSize: 1, defaultLabel: "", grid: { size: { x: 1, y: 1 }, inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 0, y: 0 } }, type: "square" as const, measurement: { type: "chebyshev" as const, scale: "5ft" } } },
};

export async function beginLibrary(server: { address: string }, token: string, fields: Record<string, unknown> = {}) {
  return fetch(`${server.address}/api/library/begin`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...libraryMetadata, files: { original: { size: 5, mime: "image/png" } }, ...fields }) });
}

export async function uploadLibrary(server: { address: string }, token: string, body: string | Uint8Array = "image", fields: Record<string, unknown> = {}) {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const begin = await beginLibrary(server, token, { files: { original: { size: bytes.length, mime: "image/png" } }, ...fields });
  if (begin.status !== 201) throw new Error(`Begin failed: ${await begin.text()}`);
  const reservation = await begin.json() as LibraryReservation;
  const upload = await fetch(`${server.address}/api/library/${reservation.assetId}/files/original`, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: bytes });
  if (upload.status !== 201 && upload.status !== 200) throw new Error(`Upload failed: ${await upload.text()}`);
  const result = await upload.json() as LibraryUploadResult;
  if (result.duplicate) return result.duplicate;
  const complete = await fetch(`${server.address}/api/library/${reservation.assetId}/complete`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (complete.status !== 200) throw new Error(`Complete failed: ${await complete.text()}`);
  return (await complete.json() as { asset: LibraryAsset }).asset;
}

export function libraryCommand(socket: Socket, value: unknown): Promise<any> {
  return new Promise(resolve => socket.emit("library_command", value, resolve));
}
