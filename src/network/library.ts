import Session from "./Session";
import { AssetStoreAccess } from "./assetStore";
import { Asset } from "../types/Asset";
import { LibraryAck, LibraryAsset, LibraryBegin, LibraryCommand, LibraryCompleteResult, LibraryReservation, LibraryUploadResult, StoredFileRole, storedFileRoles } from "../sceneRules/library";

export type PreparedLibraryUpload = {
  metadata: Omit<LibraryBegin, "files">;
  files: Partial<Record<StoredFileRole, Pick<Asset, "file" | "mime" | "width" | "height">>> & { original: Pick<Asset, "file" | "mime" | "width" | "height"> };
};

async function request<T>(access: AssetStoreAccess, method: string, path: string, body?: BodyInit, mime?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${access.url}/api/library${path}`, { method,
      headers: { Authorization: `Bearer ${access.token}`, ...(mime ? { "Content-Type": mime } : {}) }, body });
  } catch { throw new Error("Unable to reach the library."); }
  const answer = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(answer?.error || `Library request failed (${response.status}).`);
  return answer;
}

/** The original always goes first; duplicates end the reservation immediately. */
export async function uploadLibraryAsset(access: AssetStoreAccess, upload: PreparedLibraryUpload,
  cache: (asset: Asset) => Promise<void>, onProgress?: (sent: number, total: number) => void
): Promise<LibraryCompleteResult> {
  const files: LibraryBegin["files"] = { original: { size: upload.files.original.file.byteLength, mime: upload.files.original.mime } };
  const roles = storedFileRoles.filter(role => !!upload.files[role]);
  for (const role of roles) files[role] = { size: upload.files[role]!.file.byteLength, mime: upload.files[role]!.mime };
  const reservation = await request<LibraryReservation>(access, "POST", "/begin", JSON.stringify({ ...upload.metadata, files }), "application/json");
  const total = roles.reduce((bytes, role) => bytes + upload.files[role]!.file.byteLength, 0);
  let sent = 0;
  try {
    for (const role of roles) {
      const file = upload.files[role]!;
      const result = await request<LibraryUploadResult>(access, "PUT", `/${encodeURIComponent(reservation.assetId)}/files/${role}`, file.file, file.mime);
      if (result.duplicate) return { asset: result.duplicate, duplicate: true };
      await cache({ ...file, id: result.id, owner: "" });
      sent += file.file.byteLength;
      onProgress?.(sent, total);
    }
    return await request<LibraryCompleteResult>(access, "POST", `/${encodeURIComponent(reservation.assetId)}/complete`);
  } catch (error) {
    await request(access, "DELETE", `/${encodeURIComponent(reservation.assetId)}`).catch(() => undefined);
    throw error;
  }
}

export function libraryCommand(session: Session, command: LibraryCommand): Promise<Extract<LibraryAck, { ok: true }>> {
  return new Promise((resolve, reject) => {
    if (!session.socket?.connected || !session.joinToken) { reject(new Error("The library is disconnected.")); return; }
    session.socket.timeout(15000).emit("library_command", command, (error: Error | null, answer: LibraryAck) => {
      if (error) reject(new Error("The library did not answer. Try again."));
      else if (!answer.ok) reject(new Error(answer.error));
      else resolve(answer);
    });
  });
}

export function sessionLibraryAccess(session: Session): AssetStoreAccess {
  if (!session.joinToken) throw new Error("Join the room before using its library.");
  return { url: session.brokerUrl, token: session.joinToken };
}

export type UploadResult = { asset: LibraryAsset; duplicate?: boolean };
