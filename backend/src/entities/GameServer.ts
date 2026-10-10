import { allowsLegacyMapStateUpdateV1 } from "../helpers/roomSwitches";
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
import { applyChanges, Update } from "../helpers/diff";
import { Map } from "../types/Map";
import { MapState } from "../types/MapState";
import { PlayerState } from "../types/PlayerState";
import { Manifest } from "../types/Manifest";
import { Pointer } from "../types/Pointer";

export default class GameServer {
  private readonly io: IOServer;
  readonly gameRepo;
  private readonly attempts: AttemptLimiter;
  private readonly joinTokens: JoinTokens;

  constructor(io: IOServer, joinTokens: JoinTokens, database?: OwlbearDatabase, clock?: Clock, attempts?: AttemptLimiter, private readonly behindProxy = false, private readonly accounts?: Accounts) {
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

  private allowsManifest(socket: Socket, gameId: string, manifest: Manifest): boolean {
    if (this.playerRole(socket, gameId) !== "player" || this.gameRepo.games[gameId].switches.uploads) return true;
    const current = this.gameRepo.getState(gameId, "manifest") as Manifest | undefined;
    // Built-in images do not enter the manifest; compare stored image ids, not aliases.
    const used = new Set(Object.values(current?.assets ?? {}).map(asset => asset.id));
    return Object.values(manifest?.assets ?? {}).every(asset => used.has(asset.id));
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
        if (
          socket.data.castDisplay && !["get_display_token", "join_display", "room_switches", "room_trust", "room_password", "new_display_link"].includes(event)
        ) {
          const gameId = gameState.getGameId();
          if (gameId && (event === "map" || event === "map_state")) {
            socket.emit(event, this.gameRepo.getState(gameId, event === "map" ? "map" : "mapState"));
          }
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
        socket.emit("display_frozen", game.displayFrozen);
        if (game.shownDisplayView) socket.emit("display_view", game.shownDisplayView);
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

      socket.on("join_game", async (gameId: string, password: string, _version?: unknown, me?: { playerId?: string }) => {
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
          socket.data.playerId = typeof me?.playerId === "string" && me.playerId.length > 0 ? me.playerId : undefined;
          socket.data.role = role;
          await gameState.joinGame(gameId);
          _gameId = gameId;
          // Only the player who joined gets the token for the asset routes
          const token = this.joinTokens.issue(socket.id, gameId, role);
          socket.emit("joined_game", socket.id, token, { role: this.playerRole(socket, gameId), room: this.gameRepo.roomState(gameId) });
          socket.emit("display_frozen", this.gameRepo.games[gameId].displayFrozen);
          socket.to(gameId).emit("joined_game", socket.id);
        } catch (error) {
          console.error("JOIN_ERROR", error);
        } finally {
          joining = false;
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
          if (display?.data.castDisplay) display.emit("display_view", view);
        }
      };

      socket.on("display_view", (view: DisplayView) => {
        const game = followedGame();
        if (
          !game || !view || typeof view.mapId !== "string" ||
          view.mapId !== (game.getState("map") as Map | undefined)?.id ||
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

      socket.on("map", async (map: Map) => {
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

          if (socket.data.role !== "gm") {
            socket.emit("map", this.gameRepo.getState(gameId, "map"));
            return;
          }
          const game = this.gameRepo.games[gameId];
          const previousMap = game.getState("map") as Map | undefined;
          if (previousMap?.id !== map?.id) {
            game.latestDisplayView = undefined;
            game.shownDisplayView = undefined;
            if (game.displayFrozen) {
              game.displayFrozen = false;
              this.io.to(gameId).emit("display_frozen", false);
            }
          }
          this.gameRepo.setState(gameId, "map", map);
          const state = this.gameRepo.getState(gameId, "map");
          socket.broadcast.to(gameId).emit("map", state);
        } catch (error) {
          console.error("MAP_ERROR", error);
        }
      });

      socket.on("map_state", async (mapState: MapState) => {
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

          if (socket.data.role !== "gm") {
            socket.emit("map_state", this.gameRepo.getState(gameId, "mapState"));
            return;
          }
          this.gameRepo.setState(gameId, "mapState", mapState);
          const state = this.gameRepo.getState(gameId, "mapState");
          socket.broadcast.to(gameId).emit("map_state", state);
        } catch (error) {
          console.error("MAP_STATE_ERROR", error);
        }
      });

      socket.on("map_state_update", async (update: Update<MapState>) => {
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

          if (socket.data.role !== "gm" && !allowsLegacyMapStateUpdateV1(update, this.playerRole(socket, gameId) === "trusted"
            ? { tokens: true, drawing: true, notes: true, fog: true, uploads: true }
            : this.gameRepo.games[gameId].switches)) {
            socket.emit("map_state", this.gameRepo.getState(gameId, "mapState"));
            return;
          }
          if (await gameState.updateState(gameId, "mapState", update)) {
            socket.to(gameId).emit("map_state_update", update);
          }
        } catch (error) {
          console.error("MAP_STATE_UPDATE_ERROR", error);
        }
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

          this.gameRepo.setPlayerState(gameId, { ...playerState, userId: socket.data.playerId, role: this.playerRole(socket, gameId) }, socket.id);
          await gameState.broadcastPlayerState(gameId, socket, "party_state");
        } catch (error) {
          console.error("PLAYER_STATE_ERROR", error);
        }
      });

      socket.on("manifest", async (manifest: Manifest) => {
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

          if (!this.allowsManifest(socket, gameId, manifest)) {
            socket.emit("manifest", this.gameRepo.getState(gameId, "manifest"));
            return;
          }
          this.gameRepo.setState(gameId, "manifest", manifest);
          const state = this.gameRepo.getState(gameId, "manifest");
          socket.broadcast.to(gameId).emit("manifest", state);
        } catch (error) {
          console.error("MANIFEST_ERROR", error);
        }
      });

      socket.on("manifest_update", async (update: Update<Manifest>) => {
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

          const current = this.gameRepo.getState(gameId, "manifest") as Manifest;
          if (current && update.id === current.mapId) {
            const proposed = structuredClone(current);
            applyChanges(proposed, update.changes);
            if (!this.allowsManifest(socket, gameId, proposed)) {
              socket.emit("manifest", current);
              return;
            }
          }
          if (await gameState.updateState(gameId, "manifest", update)) {
            socket.to(gameId).emit("manifest_update", update);
          }
        } catch (error) {
          console.error("MANIFEST_UPDATE_ERROR", error);
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

          socket.to(gameId).emit("player_pointer", playerPointer);
        } catch (error) {
          console.error("POINTER_ERROR", error);
        }
      });
    });
  }
}
