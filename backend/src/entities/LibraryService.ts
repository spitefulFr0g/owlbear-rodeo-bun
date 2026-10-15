import { randomUUID } from "crypto";
import express, { Router } from "express";
import type { Server, Socket } from "socket.io";
import { assetBytes, checkAssetCount, checkFolderCount, checkLibraryName, maySetAssetType, mayUpload, quotaError, sameLibrary, storedFileRoles } from "../../../src/sceneRules/library";
import type { LibraryAsset, LibraryBegin, LibraryCommand, LibraryFiles, LibraryFolder, LibraryIdentity, LibrarySnapshot, LibraryDelta, LibraryReservation, LibraryRole } from "../../../src/sceneRules/library";
import { maxTextLength } from "../../../src/sceneRules";
import type { Clock } from "../clock";
import type { OwlbearDatabase } from "../database";
import type Accounts from "../accounts/Accounts";
import { requireAdministrator } from "../accounts/requireAdministrator";
import type GameRepository from "./GameRepository";
import type JoinTokens from "./JoinTokens";
import type { FsAssetStore } from "./AssetStore";

type Context = { roomId: string; accountId: string | null; browser: string; role: LibraryRole; socket: Socket };
type Reservation = { token: string; request: LibraryBegin; uploading: Set<string>; cancelTimer: () => void };

/** Owns authorization and the reservation lifecycle; repository owns durable records. */
export default class LibraryService {
  private reservations = new Map<string, Reservation>();
  private cleanup = new Set<Promise<unknown>>();
  private views = new Map<string, LibrarySnapshot>();
  constructor(private readonly database: OwlbearDatabase, private readonly store: FsAssetStore, private readonly tokens: JoinTokens,
    private readonly rooms: GameRepository, private readonly io: Server, private readonly accounts: Accounts, private readonly clock: Clock,
    private readonly maxBytes: number) {}

  private context(socket: Socket, roomId: string): Context {
    const room = this.rooms.games[roomId];
    if (!room || !socket.rooms.has(roomId) || socket.data.castDisplay) throw new Error("Library access refused");
    const role = socket.data.role === "gm" ? "gm" : room.trustedPlayerIds.has(socket.data.playerId) ? "trusted" : "player";
    return { roomId, accountId: room.gmAccountId, browser: socket.data.playerId ?? "", role, socket };
  }
  private authenticate(token: string): Context {
    const connection = this.tokens.connection(token);
    const socket = connection && this.io.sockets.sockets.get(connection.socketId);
    if (!connection || !socket) throw new Error("Join the room before using its library");
    return this.context(socket, connection.gameId);
  }
  private identity(context: Context, kind: "room" | "account"): LibraryIdentity {
    if (kind === "account" && (context.role !== "gm" || !context.accountId)) throw new Error("Only the GM can use the account library");
    return { kind, id: kind === "room" ? context.roomId : context.accountId! };
  }
  private assets(context: Context): LibraryAsset[] {
    return [...this.database.library.assets(this.identity(context, "room")), ...(context.role === "gm" && context.accountId ? this.database.library.assets(this.identity(context, "account")) : [])];
  }
  private folders(context: Context): LibraryFolder[] {
    return [...this.database.library.folders(this.identity(context, "room")), ...(context.role === "gm" && context.accountId ? this.database.library.folders(this.identity(context, "account")) : [])];
  }
  private snapshot(context: Context, cache = new Map<string, { assets: LibraryAsset[]; folders: LibraryFolder[] }>()): LibrarySnapshot {
    const repo = this.database.library;
    const read = (library: LibraryIdentity) => {
      const key = `${library.kind}:${library.id}`;
      let records = cache.get(key);
      if (!records) { records = { assets: repo.visibleAssets(library), folders: repo.folders(library) }; cache.set(key, records); }
      return records;
    };
    const room = this.identity(context, "room");
    const roomRecords = read(room);
    const account = { kind: "account", id: context.accountId ?? "" } as const;
    const accountRecords = context.role === "gm" ? read(account) : { assets: [], folders: [] };
    const assets = [...roomRecords.assets, ...accountRecords.assets].filter(a => !a.uploading && (context.role === "gm" || a.uploader === context.browser));
    const folders = [...roomRecords.folders, ...accountRecords.folders].filter(f => context.role === "gm" ? f.owner === null : f.owner === context.browser);
    return { assets, folders, usage: this.usage(context) };
  }
  private usage(context: Context): LibrarySnapshot["usage"] {
    const repo = this.database.library;
    const room = this.identity(context, "room");
    const bytes = (library: LibraryIdentity, uploader?: string | null) => {
      const { bytes, reservedBytes } = repo.usage(library, uploader);
      return { bytes, reservedBytes };
    };
    if (context.role !== "gm") return { player: { ...bytes(room, context.browser), quota: repo.playerQuota(context.roomId) } };
    const account = this.identity(context, "account");
    const own = bytes(room, null);
    return { room: { ...bytes(room), quota: repo.quota(room) }, gmBytes: own.bytes + own.reservedBytes,
      players: repo.playerBytes(room), playerQuota: repo.playerQuota(context.roomId), account: { ...bytes(account), quota: repo.quota(account) } };
  }
  joined(socket: Socket, roomId: string): void {
    if (socket.data.castDisplay) return;
    try { const view = this.snapshot(this.context(socket, roomId)); this.views.set(socket.id, view); socket.emit("library_snapshot", view); }
    catch { /* The room may have been deleted while joining. */ }
  }
  disconnected(socket: Socket): void {
    this.views.delete(socket.id);
    for (const [id, reservation] of this.reservations) if (this.tokens.connection(reservation.token)?.socketId === socket.id) this.cancel(id, false);
    this.broadcast();
  }
  broadcast(usageOnly = false): void {
    const cache = new Map<string, { assets: LibraryAsset[]; folders: LibraryFolder[] }>();
    for (const socket of this.io.sockets.sockets.values()) {
      const before = this.views.get(socket.id);
      if (!before) continue;
      const roomId = [...socket.rooms].find(id => !!this.rooms.games[id]);
      if (!roomId) continue;
      try {
        const context = this.context(socket, roomId);
        if (usageOnly) {
          const usage = this.usage(context);
          if (JSON.stringify(before.usage) !== JSON.stringify(usage)) {
            const empty = () => ({ added: [], changed: [], removed: [] });
            socket.emit("library_delta", { assets: empty(), folders: empty(), usage } satisfies LibraryDelta);
            this.views.set(socket.id, { ...before, usage });
          }
          continue;
        }
        const after = this.snapshot(context, cache);
        const diff = <T extends { id: string }>(old: T[], next: T[]) => {
          const previous = new Map(old.map(record => [record.id, record]));
          const current = new Set(next.map(record => record.id));
          return { added: next.filter(record => !previous.has(record.id)),
            changed: next.filter(record => previous.has(record.id) && JSON.stringify(record) !== JSON.stringify(previous.get(record.id))),
            removed: old.filter(record => !current.has(record.id)).map(record => record.id) };
        };
        const delta: LibraryDelta = { assets: diff(before.assets, after.assets), folders: diff(before.folders, after.folders), usage: after.usage };
        if (JSON.stringify(before) !== JSON.stringify(after)) socket.emit("library_delta", delta);
        this.views.set(socket.id, after);
      } catch { /* A deleted room or signed-out connection receives no library. */ }
    }
  }
  attach(socket: Socket, roomId: () => string | undefined): void {
    socket.on("library_command", (value: LibraryCommand, answer: (value: unknown) => void) => {
      if (typeof answer !== "function") return;
      try { const context = this.context(socket, roomId() ?? ""); const id = this.command(context, value); this.broadcast(); answer({ ok: true, ...(id ? { id } : {}) }); }
      catch (error: any) { answer({ ok: false, error: error.message }); }
    });
  }
  private editable(context: Context, id: string): LibraryAsset {
    const asset = this.assets(context).find(a => a.id === id && !a.uploading);
    if (!asset || (context.role !== "gm" && asset.uploader !== context.browser)) throw new Error("You cannot change that asset");
    return asset;
  }
  private folder(id: string | null | undefined, library: LibraryIdentity, owner: string | null): void {
    if (id == null) return;
    const folder = this.database.library.folder(id);
    if (!folder || !sameLibrary(folder.library, library) || folder.owner !== owner) throw new Error("Choose a folder belonging to this asset's library and uploader");
  }
  private command(context: Context, value: LibraryCommand): string | undefined {
    if (!value || typeof value !== "object") throw new Error("Invalid library command");
    const repo = this.database.library;
    if (context.role !== "gm" && !context.browser) throw new Error("A browser identity is required");
    if (value.action === "player-quota") {
      if (context.role !== "gm") throw new Error("Only the GM can set the player quota");
      repo.setPlayerQuota(context.roomId, value.bytes); return;
    }
    if (value.action === "folder-create") {
      if (value.library !== "room" && value.library !== "account") throw new Error("Invalid library");
      const library = this.identity(context, value.library);
      const name = checkLibraryName(value.name);
      if (!name) throw new Error("Give the folder a name from 1 to 100 characters");
      if (!checkFolderCount(repo.usage(library).folders)) throw new Error("Library folder count limit reached");
      const id = randomUUID(); repo.saveFolder({ id, library, name, owner: context.role === "gm" ? null : context.browser }); return id;
    }
    if (value.action === "folder-edit" || value.action === "folder-delete") {
      const folder = this.folders(context).find(f => f.id === value.id);
      if (!folder || (context.role !== "gm" && folder.owner !== context.browser)) throw new Error("You cannot change that folder");
      if (value.action === "folder-delete") repo.deleteFolder(folder.id);
      else { const name = checkLibraryName(value.name); if (!name) throw new Error("Give the folder a name from 1 to 100 characters"); repo.saveFolder({ ...folder, name }); }
      return;
    }
    const asset = this.editable(context, value.id);
    if (value.action === "delete") { repo.deleteAsset(asset.id); return; }
    if (value.action === "move") {
      if (context.role !== "gm") throw new Error("Only the GM can move assets between libraries");
      if (!["room", "account"].includes(value.destination)) throw new Error("Invalid destination");
      const destination = this.identity(context, value.destination);
      const moved = sameLibrary(destination, asset.library) ? { ...asset, uploader: null, folderId: null } : repo.moveAsset(asset.id, destination);
      repo.saveAsset({ ...moved, uploaderName: undefined });
      return;
    }
    if (value.action !== "edit" || !value.changes || Object.keys(value.changes).some(k => !["name", "type", "defaults", "folderId"].includes(k))) throw new Error("Invalid asset edit");
    const changed = { ...asset, ...value.changes };
    this.validateMetadata(context, changed);
    this.folder(changed.folderId, asset.library, asset.uploader);
    repo.saveAsset({ ...changed, name: checkLibraryName(changed.name)! });
  }
  private validateMetadata(context: Context, value: Pick<LibraryAsset, "name" | "type" | "width" | "height" | "outline" | "defaults">): void {
    if (!value || typeof value !== "object") throw new Error("Invalid asset metadata");
    if (!checkLibraryName(value.name) || !maySetAssetType(context.role, value.type)) throw new Error("Invalid asset name or type");
    if (![value.width, value.height].every(n => Number.isFinite(n) && n > 0)) throw new Error("Invalid image dimensions");
    const defaults = value.defaults;
    const grid = defaults?.grid;
    const point = (p: any) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    if (!defaults || !Number.isFinite(defaults.defaultSize) || defaults.defaultSize <= 0 || typeof defaults.defaultLabel !== "string" || defaults.defaultLabel.length > maxTextLength ||
      !grid || !point(grid.size) || grid.size.x <= 0 || grid.size.y <= 0 || !point(grid.inset?.topLeft) || !point(grid.inset?.bottomRight) ||
      !["square", "hexVertical", "hexHorizontal"].includes(grid.type) || !["chebyshev", "alternating", "euclidean", "manhattan"].includes(grid.measurement?.type) || typeof grid.measurement.scale !== "string") throw new Error("Invalid asset defaults");
    const outline = value.outline;
    const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
    if (!outline || (outline.type === "circle" ? ![outline.x, outline.y, outline.radius].every(finite) || outline.radius < 0 :
      outline.type === "rect" ? ![outline.x, outline.y, outline.width, outline.height].every(finite) || outline.width < 0 || outline.height < 0 :
      outline.type === "path" ? !Array.isArray(outline.points) || outline.points.length > 20000 || outline.points.length % 2 !== 0 || !outline.points.every(finite) : true)) throw new Error("Invalid outline");
  }
  private begin(context: Context, token: string, request: LibraryBegin): LibraryReservation {
    if (context.role !== "gm" && !context.browser) throw new Error("A browser identity is required");
    if (!mayUpload(context.role, this.rooms.games[context.roomId].switches.uploads)) throw new Error("Uploads are disabled");
    this.validateMetadata(context, request);
    if (request.import !== undefined && typeof request.import !== "boolean") throw new Error("Invalid import flag");
    const library = this.identity(context, request.import ? "account" : "room");
    const uploader = context.role === "gm" ? null : context.browser;
    this.folder(request.folderId, library, uploader);
    if (!request.files?.original || Object.keys(request.files).some(role => !storedFileRoles.includes(role as any))) throw new Error("Declare the original and each file role");
    const files = Object.fromEntries(Object.entries(request.files).map(([role, file]) => {
      if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > this.maxBytes || typeof file.mime !== "string" || !/^(image\/[\w.+-]+|application\/octet-stream)$/.test(file.mime)) throw new Error("Invalid file size or media type");
      return [role, { id: randomUUID(), size: file.size }];
    })) as LibraryFiles;
    const repo = this.database.library;
    const usage = repo.usage(library);
    if (!checkAssetCount(usage.assets, usage.reservedAssets)) throw new Error("Library asset count limit reached");
    const error = quotaError(assetBytes(files), { ...usage, quota: repo.quota(library) }, library.kind,
      uploader ? { ...repo.usage(library, uploader), quota: repo.playerQuota(context.roomId) } : undefined);
    if (error) throw new Error(error);
    const assetId = randomUUID();
    repo.saveAsset({ id: assetId, library, name: checkLibraryName(request.name)!, type: request.type, width: request.width, height: request.height,
      outline: request.outline, defaults: request.defaults, files, folderId: request.folderId ?? null, uploader, uploaderName: uploader ? this.rooms.games[context.roomId].presenceState[context.socket.id]?.nickname || uploader : undefined, created: this.clock.now(), uploading: true });
    this.reservations.set(assetId, { token, request, uploading: new Set(), cancelTimer: this.clock.after(15 * 60 * 1000, () => this.cancel(assetId)) });
    this.broadcast(true);
    return { assetId, files };
  }
  async stop(): Promise<void> {
    for (const id of this.reservations.keys()) this.cancel(id, false);
    await Promise.all(this.cleanup);
  }
  private cancel(id: string, broadcast = true): void {
    const reservation = this.reservations.get(id);
    reservation?.cancelTimer(); this.reservations.delete(id);
    const asset = this.database.library.asset(id);
    if (asset?.uploading) {
      this.database.library.deleteAsset(id);
      const cleanup = Promise.all(Object.values(asset.files).map(file => this.store.delete(file.id)));
      this.cleanup.add(cleanup);
      cleanup.finally(() => this.cleanup.delete(cleanup)).catch(error => console.error("LIBRARY_UPLOAD_CLEANUP_ERROR", error));
    }
    if (broadcast) this.broadcast(true);
  }
  private reserved(context: Context, token: string, id: string): { asset: LibraryAsset; reservation: Reservation } {
    const asset = this.database.library.asset(id);
    const reservation = this.reservations.get(id);
    if (!asset?.uploading || !reservation || reservation.token !== token || !sameLibrary(asset.library, this.identity(context, reservation.request.import ? "account" : "room"))) throw new Error("Upload reservation not found for this connection");
    if (!mayUpload(context.role, this.rooms.games[context.roomId].switches.uploads)) { this.cancel(id); throw new Error("Uploads are disabled"); }
    if (!maySetAssetType(context.role, asset.type)) { this.cancel(id); throw new Error("Asset type is not permitted"); }
    return { asset, reservation };
  }
  routes(): Router {
    const router = Router();
    router.get("/admin/library-quotas", requireAdministrator(this.accounts), (_req, res) => {
      const accounts = this.accounts.list().map(account => {
        const library = { kind: "account", id: account.id } as const;
        return { ...account, usage: this.database.library.usage(library), quota: this.database.library.quota(library), sizeBytes: this.database.accountLibrarySizeBytes(account.id) };
      });
      const rooms = this.database.administratorRooms().map(room => {
        const library = { kind: "room", id: room.id } as const;
        return { id: room.id, name: room.name, gmAccountId: room.gmAccountId, usage: this.database.library.usage(library), quota: this.database.library.quota(library), playerQuota: this.database.library.playerQuota(room.id), sizeBytes: this.database.roomSizeBytes(room.id) };
      });
      res.json({ accounts, rooms });
    });
    router.use("/library", (req, res, next) => {
      const [scheme, token] = (req.headers.authorization ?? "").split(" ");
      try { if (scheme !== "Bearer") throw new Error("Join the room first"); res.locals.context = this.authenticate(token); res.locals.token = token; next(); }
      catch (error: any) { req.resume(); res.status(403).json({ error: error.message }); }
    });
    router.post("/library/begin", express.json({ limit: "256kb" }), (req, res) => {
      try { res.status(201).json(this.begin(res.locals.context, res.locals.token, req.body)); }
      catch (error: any) { res.status(400).json({ error: error.message }); }
    });
    router.put("/library/:id/files/:role", async (req, res) => {
      let owns = false;
      try {
        const { asset, reservation } = this.reserved(res.locals.context, res.locals.token, req.params.id);
        owns = true;
        const role = req.params.role;
        const file = asset.files[role as keyof LibraryFiles];
        if (!file || reservation.uploading.size || this.database.asset(file.id)) throw new Error("File role is absent, already uploaded or busy");
        if (role !== "original" && !this.database.asset(asset.files.original.id)) throw new Error("Upload the original first");
        reservation.uploading.add(role);
        const declaredSize = file.size;
        const body = req.iterator({ destroyOnReturn: false });
        const measured = async function* () { let size = 0; for await (const chunk of body) { size += chunk.length; if (size > declaredSize) throw new Error("File exceeds declared size"); yield chunk; } if (size !== declaredSize) throw new Error("File does not match declared size"); };
        await this.store.put(file.id, { mime: reservation.request.files[role as keyof LibraryFiles]!.mime, width: asset.width, height: asset.height, owner: asset.uploader ?? "gm" }, measured());
        if (!this.reservations.has(asset.id)) { await this.store.delete(file.id); throw new Error("Upload reservation expired"); }
        this.reserved(this.authenticate(res.locals.token), res.locals.token, asset.id);
        reservation.uploading.delete(role);
        const duplicate = role === "original" ? this.database.library.duplicate(asset.library, file.id, asset.uploader ?? undefined) : undefined;
        if (duplicate) { this.cancel(asset.id); await Promise.all(this.cleanup); res.json({ id: file.id, duplicate }); }
        else res.status(201).json({ id: file.id });
      } catch (error: any) {
        if (owns) { this.cancel(req.params.id); await Promise.all(this.cleanup); }
        req.resume(); res.status(400).json({ error: error.message });
      }
    });
    router.post("/library/:id/complete", (req, res) => {
      try {
        const { asset, reservation } = this.reserved(res.locals.context, res.locals.token, req.params.id);
        if (reservation.uploading.size || Object.values(asset.files).some(file => !this.database.asset(file.id))) throw new Error("Upload every declared file before completing");
        const duplicate = this.database.library.duplicate(asset.library, asset.files.original.id, asset.uploader ?? undefined);
        if (duplicate) { this.cancel(asset.id); res.json({ asset: duplicate, duplicate: true }); return; }
        const complete = { ...asset, uploading: false }; this.database.library.saveAsset(complete); reservation.cancelTimer(); this.reservations.delete(asset.id); this.broadcast(); res.json({ asset: complete });
      } catch (error: any) { res.status(400).json({ error: error.message }); }
    });
    router.delete("/library/:id", (req, res) => {
      try { this.reserved(res.locals.context, res.locals.token, req.params.id); this.cancel(req.params.id); res.sendStatus(204); }
      catch (error: any) { res.status(400).json({ error: error.message }); }
    });
    for (const kind of ["room", "account"] as const) router.patch(`/admin/${kind === "room" ? "rooms" : "accounts"}/:id/quota`, requireAdministrator(this.accounts), express.json(), (req, res) => {
      try {
        const exists = kind === "room" ? this.database.room(req.params.id) : this.database.connection.query("SELECT id FROM accounts WHERE id = ?").get(req.params.id);
        if (!exists) { res.status(404).json({ error: "Library not found" }); return; }
        this.database.library.setQuota({ kind, id: req.params.id }, req.body.bytes); this.broadcast(); res.json({ ok: true });
      } catch (error: any) { res.status(400).json({ error: error.message }); }
    });
    return router;
  }
}
