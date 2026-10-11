import { applyChange, visibleTo, changeFor, Item, Scene, mayChange, Person, checkChange, readBatch, topOrder, gmOwner, Change, SceneGrid, checkGrid, defaultSceneGrid } from "../../../src/sceneRules";
import { randomBytes } from "crypto";
import Accounts from "../accounts/Accounts";
import { clientAddress } from "../clientRequest";
import AttemptLimiter from "../AttemptLimiter";
import { realClock, Clock } from "../clock";
import { OwlbearDatabase } from "../database";
/* eslint-disable no-underscore-dangle */
import { Server as HttpServer } from "http";
import { Socket, Server as IOServer } from "socket.io";
import Auth from "./Auth";
import { DisplayView } from "../types/DisplayView";
import GameRepository from "./GameRepository";
import GameState from "./GameState";
import JoinTokens from "./JoinTokens";
import { PlayerState } from "../types/PlayerState";
import { playerColours, isPlayerColour } from "../types/PlayerColour";
import { Pointer } from "../types/Pointer";

export default class GameServer {
  private readonly io: IOServer;
  private stopping = false;
  readonly gameRepo;
  private readonly attempts: AttemptLimiter;
  private readonly joinTokens: JoinTokens;

  constructor(io: IOServer, joinTokens: JoinTokens, private readonly database?: OwlbearDatabase, private readonly clock: Clock = realClock, attempts?: AttemptLimiter, private readonly behindProxy = false, private readonly accounts?: Accounts) {
    this.attempts = attempts ?? new AttemptLimiter(clock ?? realClock);
    this.io = io;
    this.joinTokens = joinTokens;
    this.gameRepo = new GameRepository(database, clock);
    joinTokens.uploadAllowed = (gameId, socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      const game = this.gameRepo.games[gameId];
      return !!socket && !!game && !socket.data.castDisplay &&
        (this.playerRole(socket, gameId) !== "player" || game.switches.uploads);
    };
  }

  private playerRole(socket: Socket, gameId: string): "gm" | "trusted" | "player" {
    if (socket.data.role === "gm") return "gm";
    return this.gameRepo.games[gameId].trustedPlayerIds.has(socket.data.playerId) ? "trusted" : "player";
  }

  private person(socket: Socket, gameId: string): Person {
    return { role: socket.data.castDisplay ? "display" : this.playerRole(socket, gameId),
      id: socket.data.castDisplay ? "" : socket.data.role === "gm" ? gmOwner : socket.data.playerId };
  }

  private sceneFor(socket: Socket, gameId: string): Scene {
    const scene = this.gameRepo.games[gameId].scenes[socket.data.viewedSceneId];
    const person = this.person(socket, gameId);
    return { id: scene.id, grid: scene.grid, fogFill: scene.fogFill, viewOnly: scene.viewOnly, items: Object.fromEntries(Object.entries(scene.items).filter(([, item]) => visibleTo(person, item))) };
  }

  private sceneList(gameId: string) {
    const game = this.gameRepo.games[gameId];
    return { scenes: Object.values(game.scenes).map(({ id, name, viewOnly }) => ({ id, name, viewOnly })),
      openSceneId: game.openSceneId, welcomeSceneId: game.welcomeSceneId };
  }

  private broadcastSceneList(gameId: string): void {
    for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
      const peer = this.io.sockets.sockets.get(id);
      if (peer?.data.role === "gm") peer.emit("scene_list", this.sceneList(gameId));
    }
  }

  private broadcastCanvas(sender: Socket, gameId: string, event: string, value: unknown): void {
    for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
      const peer = this.io.sockets.sockets.get(id);
      if (peer && peer.id !== sender.id && peer.data.viewedSceneId === sender.data.viewedSceneId && (this.gameRepo.games[gameId].session || peer.data.role === "gm")) {
        peer.emit(event, value);
      }
    }
  }

  private setSession(gameId: string, running: boolean): void {
    const game = this.gameRepo.games[gameId];
    game.cancelSessionCountdown?.();
    game.cancelSessionCountdown = undefined;
    const starting = running && !game.session;
    game.session = running;
    this.io.to(gameId).emit("room_state", this.gameRepo.roomState(gameId));
    if (starting) {
      for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
        const peer = this.io.sockets.sockets.get(id);
        if (!peer || peer.data.role === "gm") continue;
        peer.data.viewedSceneId = game.openSceneId;
        peer.emit("scene_snapshot", { scene: this.sceneFor(peer, gameId) });
        if (peer.data.castDisplay && game.shownDisplayView) peer.emit("display_view", game.shownDisplayView);
      }
    }
  }

  public stop(): void {
    this.stopping = true;
    for (const game of Object.values(this.gameRepo.games)) game.cancelSessionCountdown?.();
  }

  public flush(): void { this.gameRepo.flush(); }

  public initaliseSocketServer(httpServer: HttpServer) {
    this.io.listen(httpServer);
  }

  public run(): void {
    this.io.on("connect", async (socket: Socket) => {
      const gameState = new GameState(this.io, socket, this.gameRepo);
      let _gameId: string;
      let joining = false;
      const account = this.accounts?.resolveAccount(socket.request);
      if (account && this.accounts) {
        const unwatch = this.accounts.watchSignIn(socket.request, () => {
          socket.emit("signed_out");
          // Send the namespace disconnect in order after any queued state.
          socket.disconnect();
        });
        socket.once("disconnect", unwatch);
      }

      // Cast displays may only request read access. New write events are
      // refused here too, before any handler can change or forward state.
      socket.use(([event], next) => {
        const roomId = gameState.getGameId();
        // Pointers are private to GM connections outside a session.
        if (roomId && !this.gameRepo.games[roomId].session && socket.data.role !== "gm" &&
          event === "player_pointer") return;
        if (
          socket.data.castDisplay && !["get_display_token", "join_display", "scene_grid", "room_switches", "room_trust", "room_password", "new_display_link", "session", "scene_create", "scene_view", "scene_show"].includes(event)
        ) {
          return;
        }
        next();
      });

      socket.on("get_display_token", (answer: (token: string | null) => void) => {
        if (typeof answer !== "function") return;
        const gameId = gameState.getGameId();
        if (socket.data.castDisplay || !gameId) {
          answer(null);
          return;
        }
        answer(socket.data.role === "gm" ? this.gameRepo.games[gameId].displayToken : null);
      });

      socket.on("join_display", async (gameId: string, displayToken: string) => {
        if (
          joining || gameState.getGameId() || typeof gameId !== "string" ||
          typeof displayToken !== "string" ||
          !this.gameRepo.isGameCreated(gameId) ||
          this.gameRepo.games[gameId].displayToken !== displayToken
        ) {
          socket.emit("display_error");
          return;
        }
        socket.data.castDisplay = true;
        _gameId = gameId;
        await gameState.joinGame(gameId, true);
        const token = this.joinTokens.issue(socket.id, gameId, "display");
        socket.emit("joined_display", socket.id, token, { room: this.gameRepo.roomState(gameId) });
        const game = this.gameRepo.games[gameId];
        socket.data.viewedSceneId = game.openSceneId;
        if (game.session) socket.emit("scene_snapshot", { scene: this.sceneFor(socket, gameId) });
        socket.emit("display_frozen", game.displayFrozen);
        if (game.session && game.shownDisplayView) socket.emit("display_view", game.shownDisplayView);
      });

      socket.on("disconnecting", async () => {
        this.joinTokens.revoke(socket.id);
        if (socket.data.castDisplay) return;
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          if (!this.gameRepo.games[gameId]) return;
          const game = this.gameRepo.games[gameId];
          const anotherGM = [...this.io.sockets.adapter.rooms.get(gameId) || []]
            .some(id => id !== socket.id && this.io.sockets.sockets.get(id)?.data.role === "gm");
          if (!this.stopping && game.session && socket.data.role === "gm" && !anotherGM) {
            game.cancelSessionCountdown?.();
            game.cancelSessionCountdown = this.clock.after(5 * 60 * 1000, () => {
              this.setSession(gameId, false);
            });
          }
          socket.to(gameId).emit("player_left", socket.id);
          // Delete player state from game
          this.gameRepo.deletePlayer(gameId, socket.id);

          // Update party state
          const partyState = this.gameRepo.getPartyState(gameId);
          socket.to(gameId).emit("party_state", partyState);
        } catch (error) {
          console.error("DISCONNECT_ERROR", error);
        }
      });

      socket.on("join_game", async (gameId: string, password: string, _version?: unknown, me?: { playerId?: string; color?: unknown }) => {
        if (joining || socket.data.castDisplay || gameState.getGameId()) return;
        joining = true;
        const auth = new Auth();

        try {
          if (typeof gameId !== "string" || typeof password !== "string") {
            console.log("invalid type in party credentials");
            socket.emit("auth_error");
            return;
          }

          if (!this.gameRepo.isGameCreated(gameId)) {
            socket.emit("room_not_found");
            return;
          }
          const role = account?.id === this.gameRepo.games[gameId].gmAccountId ? "gm" : "player";
          const keys = [`room:id:${gameId}`, `room:address:${clientAddress(socket.request, this.behindProxy, socket.handshake.address)}`];
          const retryAfterSeconds = this.attempts.retryAfterSeconds(keys);
          if (role !== "gm" && retryAfterSeconds) {
            socket.emit("auth_wait", retryAfterSeconds);
            return;
          }
          const hash = this.gameRepo.getGamePasswordHash(gameId);
          const game = this.gameRepo.games[gameId];
          // A browser sends the last password it used, which a room made
          // without one must not refuse
          const open = game.gmAccountId !== null && !game.hasPassword;
          if (role !== "gm" && !open && !await auth.checkPassword(password, hash)) {
            // Opening a room's link sends no password; only a guess is counted
            if (password !== "") this.attempts.wrong(keys);
            socket.emit("auth_error");
            return;
          }
          if (!socket.connected) return;
          // The room may have been deleted while its password was checked.
          if (!this.gameRepo.isGameCreated(gameId)) {
            socket.emit("room_not_found");
            return;
          }
          socket.data.playerId = typeof me?.playerId === "string" && me.playerId.length > 0 && (role === "gm" || me.playerId !== gmOwner) ? me.playerId : undefined;
          socket.data.role = role;
          const usedColours = new Set([...this.io.sockets.adapter.rooms.get(gameId) || []]
            .map(id => this.io.sockets.sockets.get(id)?.data.color));
          socket.data.color = isPlayerColour(me?.color) ? me.color :
            playerColours.find(color => !usedColours.has(color)) ?? playerColours[0];
          await gameState.joinGame(gameId);
          _gameId = gameId;
          if (role === "gm") {
            game.cancelSessionCountdown?.();
            game.cancelSessionCountdown = undefined;
          }
          // Only the player who joined gets the token for the asset routes
          const token = this.joinTokens.issue(socket.id, gameId, role);
          socket.emit("joined_game", socket.id, token, { role: this.playerRole(socket, gameId), color: socket.data.color, room: this.gameRepo.roomState(gameId) });
          socket.data.viewedSceneId = game.openSceneId;
          if (role === "gm") socket.emit("scene_list", this.sceneList(gameId));
          if (role === "gm" || game.session) socket.emit("scene_snapshot", { scene: this.sceneFor(socket, gameId) });
          socket.emit("display_frozen", this.gameRepo.games[gameId].displayFrozen);
          socket.to(gameId).emit("joined_game", socket.id);
        } catch (error) {
          console.error("JOIN_ERROR", error);
        } finally {
          joining = false;
        }
      });

      socket.on("scene_create", (value: unknown, answer?: (result: { ok: boolean; error?: string; sceneId?: string }) => void) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        const payload = value as { name?: unknown } | null;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          Object.keys(payload).some(key => key !== "name") || typeof payload.name !== "string" ||
          !payload.name.trim().length || payload.name.trim().length > 100) {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        const sceneId = randomBytes(16).toString("hex");
        game.scenes[sceneId] = { id: sceneId, name: payload.name.trim(), grid: { ...defaultSceneGrid },
          fogFill: false, viewOnly: false, items: {} };
        socket.data.viewedSceneId = sceneId;
        this.gameRepo.save(gameId);
        socket.emit("scene_snapshot", { scene: this.sceneFor(socket, gameId) });
        this.broadcastSceneList(gameId);
        if (typeof answer === "function") answer({ ok: true, sceneId });
      });

      socket.on("scene_view", (value: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        const payload = value as { sceneId?: unknown } | null;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          Object.keys(payload).some(key => key !== "sceneId") || typeof payload.sceneId !== "string") {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        if (!Object.hasOwn(this.gameRepo.games[gameId].scenes, payload.sceneId)) {
          if (typeof answer === "function") answer({ ok: false, error: "not_found" });
          return;
        }
        socket.data.viewedSceneId = payload.sceneId;
        socket.emit("scene_snapshot", { scene: this.sceneFor(socket, gameId) });
        if (typeof answer === "function") answer({ ok: true });
      });

      socket.on("scene_show", (value: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        const respond = (result: { ok: boolean; error?: string }) => {
          if (typeof answer === "function") answer(result);
        };
        if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") {
          respond({ ok: false, error: "not_room_gm" });
          return;
        }
        const payload = value as { sceneId?: unknown; view?: Partial<DisplayView> } | null;
        const view = payload?.view;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          Object.keys(payload).some(key => !["sceneId", "view"].includes(key)) ||
          typeof payload.sceneId !== "string" || !view || typeof view !== "object" || Array.isArray(view) ||
          Object.keys(view).some(key => !["x", "y", "width", "height"].includes(key)) ||
          ![view.x, view.y, view.width, view.height].every(number => typeof number === "number" && Number.isFinite(number)) ||
          view.width! <= 0 || view.height! <= 0) {
          respond({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        if (!Object.hasOwn(game.scenes, payload.sceneId)) {
          respond({ ok: false, error: "not_found" });
          return;
        }
        if (socket.data.viewedSceneId !== payload.sceneId) {
          respond({ ok: false, error: "not_viewing" });
          return;
        }
        if (game.openSceneId === payload.sceneId) {
          respond({ ok: true });
          return;
        }
        game.openSceneId = payload.sceneId;
        if (game.session) {
          const carriedView = { sceneId: payload.sceneId, x: view.x!, y: view.y!, width: view.width!, height: view.height! };
          game.latestDisplayView = carriedView;
          game.shownDisplayView = carriedView;
          for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
            const peer = this.io.sockets.sockets.get(id);
            if (!peer || peer.data.role === "gm") continue;
            peer.data.viewedSceneId = payload.sceneId;
            peer.emit("scene_snapshot", { scene: this.sceneFor(peer, gameId) });
            peer.emit(peer.data.castDisplay ? "display_view" : "player_view", carriedView);
          }
        } else {
          game.latestDisplayView = undefined;
          game.shownDisplayView = undefined;
        }
        this.gameRepo.save(gameId);
        this.broadcastSceneList(gameId);
        respond({ ok: true });
      });

      socket.on("scene_grid", (value: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        let scene = game.scenes[socket.data.viewedSceneId];
        const payload = value as { sceneId?: unknown; grid?: SceneGrid } | null;
        const grid = payload?.grid;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
            Object.keys(payload).some(key => !["sceneId", "grid"].includes(key)) ||
            payload.sceneId !== scene.id || !checkGrid(grid)) {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        scene = { ...scene, grid };
        game.scenes[scene.id] = scene;
        this.gameRepo.changed(gameId);
        socket.emit("scene_grid", { sceneId: scene.id, grid });
        this.broadcastCanvas(socket, gameId, "scene_grid", { sceneId: scene.id, grid });
        if (typeof answer === "function") answer({ ok: true });
      });

      socket.on("scene_changes", (value: unknown) => {
        const batch = readBatch(value);
        const gameId = gameState.getGameId();
        if (!batch || !gameId || socket.data.castDisplay) return;
        const game = this.gameRepo.games[gameId];
        let scene = game.scenes[socket.data.viewedSceneId];
        const person = this.person(socket, gameId);
        if (batch.sceneId !== scene.id) {
          socket.emit("scene_answer", { batchId: batch.id, sceneId: batch.sceneId, applied: [],
            refused: batch.changes.map(change => ({ id: change.type === "add" ? change.item.id : change.id, item: null })) });
          return;
        }
        const applied: Change[] = [];
        const transitions: { before: Item | undefined; after: Item | undefined; change: Change }[] = [];
        const refused: { id: string; item: Item | null }[] = [];
        for (const change of batch.changes) {
          const id = change.type === "add" ? change.item.id : change.id;
          const before = Object.hasOwn(scene.items, id) ? scene.items[id] : undefined;
          const refusedItem = before && visibleTo(person, before) ? before : null;
          if ((socket.data.role !== "gm" && !game.session) ||
              checkChange(scene, change) ||
              !mayChange(person, { switches: game.switches, knownImage: image =>
                image.type === "default" || [image.file, image.thumbnail, ...Object.values(image.resolutions ?? {})]
                  .filter((id): id is string => id !== undefined)
                  .every(id => this.database?.roomHasAsset(gameId, id) ?? false) },
                change.type === "add" ? undefined : before, change) ||
              (socket.data.role !== "gm" && !socket.data.playerId)) {
            refused.push({ id, item: refusedItem });
            continue;
          }
          let actual: Change = change;
          if (change.type === "add") {
            actual = { type: "add", item: { ...change.item,
              owner: socket.data.role === "gm" ? gmOwner : socket.data.playerId,
              order: topOrder(scene, change.item.layer) } };
          } else if (change.type === "update") {
            const item = scene.items[change.id];
            if (item && (change.fields.layer !== undefined ||
                (change.fields.position !== undefined && item.kind === "image" && item.layer !== "map"))) {
              const fields = { ...change.fields, order: topOrder(scene, change.fields.layer ?? item.layer) };
              actual = { ...change, fields };
            }
          }
          const result = applyChange(scene, actual);
          if (!result.applied) {
            refused.push({ id, item: refusedItem });
            continue;
          }
          scene = { ...result.scene, name: scene.name };
          game.scenes[scene.id] = scene;
          applied.push(actual);
          transitions.push({ before, after: Object.hasOwn(scene.items, id) ? scene.items[id] : undefined, change: actual });
        }
        if (applied.length) this.gameRepo.changed(gameId);
        socket.emit("scene_answer", { batchId: batch.id, sceneId: batch.sceneId, applied, refused });
        if (applied.length) {
          for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
            const peer = this.io.sockets.sockets.get(id);
            if (!peer || peer.id === socket.id || peer.data.viewedSceneId !== scene.id || (!game.session && peer.data.role !== "gm")) continue;
            const viewer = this.person(peer, gameId);
            const changes = transitions.flatMap(({ before, after, change }) => {
              const visibleChange = changeFor(viewer, before, after, change);
              return visibleChange ? [visibleChange] : [];
            });
            if (changes.length) peer.emit("scene_changes", { sceneId: scene.id, changes });
          }
        }
      });

      const followedGame = () => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") return;
        return this.gameRepo.games[gameId];
      };

      const forwardView = (gameId: string, view: DisplayView) => {
        for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
          const display = this.io.sockets.sockets.get(id);
          if (this.gameRepo.games[gameId].session && display?.data.castDisplay) display.emit("display_view", view);
        }
      };

      socket.on("display_view", (view: DisplayView) => {
        const game = followedGame();
        if (
          !game || !view || typeof view !== "object" || Array.isArray(view) ||
          typeof view.sceneId !== "string" || view.sceneId !== game.openSceneId || socket.data.viewedSceneId !== game.openSceneId ||
          ![view.x, view.y, view.width, view.height].every(
            (value) => typeof value === "number" && Number.isFinite(value)
          ) || view.width <= 0 || view.height <= 0
        ) return;
        game.latestDisplayView = view;
        if (!game.displayFrozen) {
          game.shownDisplayView = view;
          forwardView(game.gameId, view);
        }
      });

      socket.on("display_freeze", (frozen: boolean) => {
        const game = followedGame();
        if (!game || typeof frozen !== "boolean" || frozen === game.displayFrozen) return;
        game.displayFrozen = frozen;
        this.io.to(game.gameId).emit("display_frozen", frozen);
        if (!frozen && game.latestDisplayView) {
          game.shownDisplayView = game.latestDisplayView;
          forwardView(game.gameId, game.latestDisplayView);
        }
      });

      socket.on("room_trust", (playerId: unknown, trusted: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        if (typeof playerId !== "string" || !playerId.length || typeof trusted !== "boolean") {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        if (trusted) game.trustedPlayerIds.add(playerId);
        else game.trustedPlayerIds.delete(playerId);
        this.gameRepo.save(gameId);
        for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
          const peer = this.io.sockets.sockets.get(id);
          if (!peer || peer.data.castDisplay || peer.data.playerId !== playerId) continue;
          const role = this.playerRole(peer, gameId);
          if (game.partyState[id]) game.partyState[id].role = role;
          peer.emit("player_role", role);
        }
        this.io.to(gameId).emit("party_state", game.partyState);
        if (typeof answer === "function") answer({ ok: true });
      });

      socket.on("session", (running: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        if (typeof running !== "boolean") {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        this.setSession(gameId, running);
        if (typeof answer === "function") answer({ ok: true });
      });

      socket.on("room_switches", (change: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        if (!change || typeof change !== "object" || Array.isArray(change) ||
          Object.entries(change).some(([key, value]) => !Object.hasOwn(game.switches, key) || typeof value !== "boolean")) {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        Object.assign(game.switches, change);
        this.gameRepo.save(gameId);
        this.io.to(gameId).emit("room_state", this.gameRepo.roomState(gameId));
        if (typeof answer === "function") answer({ ok: true });
      });

      socket.on("room_password", async (password: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        if (password !== null && typeof password !== "string") {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        const hash = await new Auth().createPasswordHash(password ?? "");
        // Hashing can finish after the room is deleted or the GM signs out.
        if (!socket.connected || this.gameRepo.games[gameId] !== game) return;
        game.passwordHash = hash;
        game.hasPassword = password !== null && password !== "";
        this.gameRepo.save(gameId);
        this.io.to(gameId).emit("room_state", this.gameRepo.roomState(gameId));
        if (typeof answer === "function") answer({ ok: true });
      });

      socket.on("new_display_link", (...args: unknown[]) => {
        const last = args.at(-1);
        const answer = typeof last === "function" ? last : undefined;
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        if (args.length > (answer ? 1 : 0)) {
          if (answer) answer({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        game.displayToken = randomBytes(32).toString("base64url");
        this.gameRepo.save(gameId);
        for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
          const display = this.io.sockets.sockets.get(id);
          if (display?.data.castDisplay) {
            display.emit("display_error");
            display.disconnect();
          }
        }
        if (typeof answer === "function") answer({ ok: true, token: game.displayToken });
      });

      socket.on("player_state", async (playerState: PlayerState) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          if (isPlayerColour(playerState?.color)) socket.data.color = playerState.color;
          this.gameRepo.setPlayerState(gameId, { ...playerState, color: socket.data.color, userId: socket.data.playerId, role: this.playerRole(socket, gameId) }, socket.id);
          await gameState.broadcastPlayerState(gameId, socket, "party_state");
        } catch (error) {
          console.error("PLAYER_STATE_ERROR", error);
        }
      });

      socket.on("player_pointer", async (playerPointer: Pointer) => {
        try {
          let gameId: string;
          if (_gameId) {
            gameId = _gameId;
          } else {
            const result = gameState.getGameId();
            if (result) {
              gameId = result;
              _gameId = result;
            } else {
              return;
            }
          }

          this.broadcastCanvas(socket, gameId, "player_pointer", playerPointer);
        } catch (error) {
          console.error("POINTER_ERROR", error);
        }
      });
    });
  }
}
