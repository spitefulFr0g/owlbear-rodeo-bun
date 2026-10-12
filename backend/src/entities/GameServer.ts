import { applyChange, visibleTo, changeFor, Item, Scene, mayChange, Person, checkChange, readBatch, topOrder, gmOwner, Change, SceneGrid, checkGrid, defaultSceneGrid, checkSceneName, maxScenes, readLive, dragFrom, dragFor, LiveMessage, maxLiveMessagesPerSecond } from "../../../src/sceneRules";
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

  private sceneFor(socket: Socket, gameId: string): Scene | null {
    const scene = this.gameRepo.games[gameId].scenes[socket.data.viewedSceneId];
    if (!scene) return null;
    const person = this.person(socket, gameId);
    return { id: scene.id, grid: scene.grid, fogFill: scene.fogFill, viewOnly: scene.viewOnly, movementMode: scene.movementMode, items: Object.fromEntries(Object.entries(scene.items).filter(([, item]) => visibleTo(person, item))) };
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
      if (peer && peer.id !== sender.id && peer.data.viewedSceneId === sender.data.viewedSceneId && sender.data.viewedSceneId != null) {
        peer.emit(event, value);
      }
    }
  }

  private endLive(socket: Socket, gameId: string): void {
    if (socket.data.castDisplay || socket.data.viewedSceneId == null) return;
    for (const kind of ["pointer", "ruler", "drag"]) this.broadcastCanvas(socket, gameId, "live", {
      sceneId: socket.data.viewedSceneId, connectionId: socket.id, kind, state: null,
    });
  }

  private viewScene(socket: Socket, gameId: string, sceneId: string | null): void {
    if (socket.data.viewedSceneId !== sceneId) this.endLive(socket, gameId);
    socket.data.viewedSceneId = sceneId;
  }

  private relayLive(socket: Socket, gameId: string, message: LiveMessage): void {
    const game = this.gameRepo.games[gameId];
    const scene = game?.scenes[message.sceneId];
    if (!scene || socket.data.castDisplay || socket.data.viewedSceneId !== scene.id) return;
    const dragItems = message.kind === "drag" && message.state ? dragFrom(this.person(socket, gameId), {
      switches: game.switches, viewOnly: scene.viewOnly,
      welcomeScreen: !game.session && game.welcomeSceneId === scene.id,
    }, scene.items, message.state.items) : undefined;
    if (dragItems && !dragItems.length) return;
    for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
      const peer = this.io.sockets.sockets.get(id);
      if (!peer || peer.id === socket.id || peer.data.viewedSceneId !== scene.id) continue;
      const items = dragItems && dragFor(this.person(peer, gameId), scene.items, dragItems);
      if (items && !items.length) continue;
      peer.emit("live", { sceneId: scene.id, kind: message.kind,
        state: items ? { items } : message.state, connectionId: socket.id });
    }
  }

  private setSession(gameId: string, running: boolean): void {
    const game = this.gameRepo.games[gameId];
    game.cancelSessionCountdown?.();
    game.cancelSessionCountdown = undefined;
    const changed = running !== game.session;
    game.session = running;
    this.io.to(gameId).emit("room_state", this.gameRepo.roomState(gameId));
    if (changed) {
      for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
        const peer = this.io.sockets.sockets.get(id);
        if (!peer || peer.data.role === "gm") continue;
        this.viewScene(peer, gameId, running ? game.openSceneId : game.welcomeSceneId);
        peer.emit("scene_snapshot", { scene: this.sceneFor(peer, gameId) });
        if (running && peer.data.castDisplay && game.shownDisplayView) peer.emit("display_view", game.shownDisplayView);
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
        // A connection on the default welcome screen has no canvas to point at.
        if (roomId && socket.data.viewedSceneId == null &&
          event === "player_pointer") return;
        if (
          socket.data.castDisplay && !["get_display_token", "join_display", "room_switches", "room_trust", "room_password", "new_display_link", "session", "scene_create", "scene_view", "scene_rename", "scene_delete", "scene_show", "scene_settings", "scene_bring", "scene_welcome", "scene_duplicate"].includes(event)
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
        this.viewScene(socket, gameId, game.session ? game.openSceneId : game.welcomeSceneId);
        socket.emit("scene_snapshot", { scene: this.sceneFor(socket, gameId) });
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
          this.endLive(socket, gameId);
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
          this.viewScene(socket, gameId, role === "gm" || game.session ? game.openSceneId : game.welcomeSceneId);
          if (role === "gm") socket.emit("scene_list", this.sceneList(gameId));
          socket.emit("scene_snapshot", { scene: this.sceneFor(socket, gameId) });
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
        const payload = value as { name?: unknown; grid?: SceneGrid; fogFill?: boolean; map?: Item } | null;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          Object.keys(payload).some(key => !["name", "grid", "fogFill", "map"].includes(key)) ||
          checkSceneName(payload.name) === undefined) {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        if (Object.keys(game.scenes).length >= maxScenes) {
          if (typeof answer === "function") answer({ ok: false, error: "cap" });
          return;
        }
        const sceneId = randomBytes(16).toString("hex");
        let scene = { id: sceneId, name: checkSceneName(payload.name)!, grid: payload.grid ?? { ...defaultSceneGrid },
          fogFill: payload.fogFill ?? false, viewOnly: false, movementMode: true, items: {} };
        if ((Object.hasOwn(payload, "grid") && !checkGrid(payload.grid)) ||
            (Object.hasOwn(payload, "fogFill") && typeof payload.fogFill !== "boolean") ||
            (Object.hasOwn(payload, "map") && (!payload.map || payload.map.kind !== "image" ||
              payload.map.layer !== "map" || checkChange(scene, { type: "add", item: payload.map })))) {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        if (payload.map) {
          const item = { ...payload.map, owner: gmOwner, locked: true, order: topOrder(scene, "map") };
          scene = { ...scene, items: { [item.id]: item } };
        }
        game.scenes[sceneId] = scene;
        this.viewScene(socket, gameId, sceneId);
        this.gameRepo.save(gameId);
        socket.emit("scene_snapshot", { scene: this.sceneFor(socket, gameId) });
        this.broadcastSceneList(gameId);
        if (typeof answer === "function") answer({ ok: true, sceneId });
      });

      socket.on("scene_duplicate", (value: unknown, answer?: (result: { ok: boolean; error?: string; sceneId?: string }) => void) => {
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
        const game = this.gameRepo.games[gameId];
        if (!Object.hasOwn(game.scenes, payload.sceneId)) {
          if (typeof answer === "function") answer({ ok: false, error: "not_found" });
          return;
        }
        if (Object.keys(game.scenes).length >= maxScenes) {
          if (typeof answer === "function") answer({ ok: false, error: "cap" });
          return;
        }
        const original = game.scenes[payload.sceneId];
        const name = checkSceneName(`${original.name} copy`);
        if (name === undefined) {
          if (typeof answer === "function") answer({ ok: false, error: "Cannot duplicate: adding ' copy' would exceed the 100-character scene name limit." });
          return;
        }
        const sceneId = randomBytes(16).toString("hex");
        game.scenes[sceneId] = { ...structuredClone(original), id: sceneId, name };
        this.gameRepo.save(gameId);
        this.broadcastSceneList(gameId);
        if (typeof answer === "function") answer({ ok: true, sceneId });
      });

      for (const event of ["scene_rename", "scene_delete"] as const) {
        socket.on(event, (value: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
          const gameId = gameState.getGameId();
          if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") {
            if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
            return;
          }
          const payload = value as { sceneId?: unknown; name?: unknown } | null;
          if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
            Object.keys(payload).some(key => key !== "sceneId" && !(event === "scene_rename" && key === "name")) ||
            typeof payload.sceneId !== "string" || (event === "scene_rename" && checkSceneName(payload.name) === undefined)) {
            if (typeof answer === "function") answer({ ok: false, error: "invalid" });
            return;
          }
          const game = this.gameRepo.games[gameId];
          if (!Object.hasOwn(game.scenes, payload.sceneId)) {
            if (typeof answer === "function") answer({ ok: false, error: "not_found" });
            return;
          }
          if (event === "scene_delete" && payload.sceneId === game.openSceneId) {
            if (typeof answer === "function") answer({ ok: false, error: "open_scene" });
            return;
          }
          if (event === "scene_rename") game.scenes[payload.sceneId].name = checkSceneName(payload.name)!;
          else {
            delete game.scenes[payload.sceneId];
            if (game.welcomeSceneId === payload.sceneId) game.welcomeSceneId = null;
            for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
              const peer = this.io.sockets.sockets.get(id);
              if (!peer || peer.data.viewedSceneId !== payload.sceneId) continue;
              this.viewScene(peer, gameId, peer.data.role === "gm" || game.session ? game.openSceneId : game.welcomeSceneId);
              peer.emit("scene_snapshot", { scene: this.sceneFor(peer, gameId) });
            }
          }
          this.gameRepo.save(gameId);
          this.broadcastSceneList(gameId);
          if (typeof answer === "function") answer({ ok: true });
        });
      }

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
        this.viewScene(socket, gameId, payload.sceneId);
        socket.emit("scene_snapshot", { scene: this.sceneFor(socket, gameId) });
        if (typeof answer === "function") answer({ ok: true });
      });

      socket.on("scene_settings", (value: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") {
          if (typeof answer === "function") answer({ ok: false, error: "not_room_gm" });
          return;
        }
        const payload = value as { sceneId?: unknown; grid?: SceneGrid; fogFill?: boolean; viewOnly?: boolean; movementMode?: boolean } | null;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          Object.keys(payload).some(key => !["sceneId", "grid", "fogFill", "viewOnly", "movementMode"].includes(key)) ||
          typeof payload.sceneId !== "string" ||
          !["grid", "fogFill", "viewOnly", "movementMode"].some(key => Object.hasOwn(payload, key)) ||
          (Object.hasOwn(payload, "grid") && !checkGrid(payload.grid)) ||
          (Object.hasOwn(payload, "fogFill") && typeof payload.fogFill !== "boolean") ||
          (Object.hasOwn(payload, "viewOnly") && typeof payload.viewOnly !== "boolean") ||
          (Object.hasOwn(payload, "movementMode") && typeof payload.movementMode !== "boolean")) {
          if (typeof answer === "function") answer({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        if (!Object.hasOwn(game.scenes, payload.sceneId)) {
          if (typeof answer === "function") answer({ ok: false, error: "not_found" });
          return;
        }
        const scene = game.scenes[payload.sceneId];
        const viewOnlyChanged = payload.viewOnly !== undefined && payload.viewOnly !== scene.viewOnly;
        if (payload.grid !== undefined) scene.grid = payload.grid;
        if (payload.fogFill !== undefined) scene.fogFill = payload.fogFill;
        if (payload.viewOnly !== undefined) scene.viewOnly = payload.viewOnly;
        if (payload.movementMode !== undefined) scene.movementMode = payload.movementMode;
        this.gameRepo.save(gameId);
        const settings = { sceneId: scene.id, grid: scene.grid, fogFill: scene.fogFill, viewOnly: scene.viewOnly, movementMode: scene.movementMode };
        for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
          const peer = this.io.sockets.sockets.get(id);
          if (peer?.data.viewedSceneId === scene.id) {
            peer.emit("scene_settings", settings);
          }
        }
        if (viewOnlyChanged) this.broadcastSceneList(gameId);
        if (typeof answer === "function") answer({ ok: true });
      });

      socket.on("scene_welcome", (value: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        const respond = (result: { ok: boolean; error?: string }) => {
          if (typeof answer === "function") answer(result);
        };
        if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") {
          respond({ ok: false, error: "not_room_gm" });
          return;
        }
        const payload = value as { sceneId?: unknown } | null;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          Object.keys(payload).some(key => key !== "sceneId") ||
          (payload.sceneId !== null && typeof payload.sceneId !== "string")) {
          respond({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        if (payload.sceneId !== null && !Object.hasOwn(game.scenes, payload.sceneId)) {
          respond({ ok: false, error: "not_found" });
          return;
        }
        if (game.welcomeSceneId !== payload.sceneId) {
          game.welcomeSceneId = payload.sceneId;
          this.gameRepo.save(gameId);
          this.broadcastSceneList(gameId);
          if (!game.session) {
            for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
              const peer = this.io.sockets.sockets.get(id);
              if (!peer || peer.data.role === "gm") continue;
              this.viewScene(peer, gameId, game.welcomeSceneId);
              peer.emit("scene_snapshot", { scene: this.sceneFor(peer, gameId) });
            }
          }
        }
        respond({ ok: true });
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
            this.viewScene(peer, gameId, payload.sceneId);
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

      socket.on("scene_bring", (value: unknown, answer?: (result: { ok: boolean; error?: string }) => void) => {
        const gameId = gameState.getGameId();
        const respond = (result: { ok: boolean; error?: string }) => {
          if (typeof answer === "function") answer(result);
        };
        if (!gameId || socket.data.castDisplay || socket.data.role !== "gm") {
          respond({ ok: false, error: "not_room_gm" });
          return;
        }
        const payload = value as { view?: Partial<DisplayView> } | null;
        const view = payload?.view;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          Object.keys(payload).some(key => key !== "view") ||
          !view || typeof view !== "object" || Array.isArray(view) ||
          Object.keys(view).some(key => !["x", "y", "width", "height"].includes(key)) ||
          ![view.x, view.y, view.width, view.height].every(number => typeof number === "number" && Number.isFinite(number)) ||
          view.width! <= 0 || view.height! <= 0) {
          respond({ ok: false, error: "invalid" });
          return;
        }
        const game = this.gameRepo.games[gameId];
        if (!game.session) {
          respond({ ok: false, error: "no_session" });
          return;
        }
        if (socket.data.viewedSceneId !== game.openSceneId) {
          respond({ ok: false, error: "not_open_scene" });
          return;
        }
        const carriedView = { sceneId: game.openSceneId, x: view.x!, y: view.y!, width: view.width!, height: view.height! };
        for (const id of this.io.sockets.adapter.rooms.get(gameId) || []) {
          const peer = this.io.sockets.sockets.get(id);
          if (peer && !peer.data.castDisplay && peer.data.role !== "gm" && peer.data.viewedSceneId === game.openSceneId) {
            peer.emit("player_view", carriedView);
          }
        }
        respond({ ok: true });
      });

      socket.on("scene_changes", (value: unknown) => {
        const batch = readBatch(value);
        const gameId = gameState.getGameId();
        if (!batch || !gameId || socket.data.castDisplay) return;
        const game = this.gameRepo.games[gameId];
        let scene = game.scenes[socket.data.viewedSceneId];
        const person = this.person(socket, gameId);
        if (!scene || batch.sceneId !== scene.id) {
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
          if (checkChange(scene, change) ||
              !mayChange(person, { switches: game.switches, viewOnly: scene.viewOnly, welcomeScreen: !game.session && game.welcomeSceneId === scene.id, knownImage: image =>
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
            if (!peer || peer.id === socket.id || peer.data.viewedSceneId !== scene.id) continue;
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

      let liveWindow = this.clock.now();
      let liveCount = 0;
      socket.on("live", (value: unknown) => {
        const gameId = gameState.getGameId();
        if (!gameId || socket.data.castDisplay) return;
        const message = readLive(value);
        if (!message) return;
        if (message.state !== null) {
          const now = this.clock.now();
          if (now - liveWindow >= 1000) { liveWindow = now; liveCount = 0; }
          if (++liveCount > maxLiveMessagesPerSecond) return;
        }
        this.relayLive(socket, gameId, message);
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
