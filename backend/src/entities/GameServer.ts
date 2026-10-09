/* eslint-disable no-underscore-dangle */
import { Server as HttpServer } from "http";
import { Socket, Server as IOServer } from "socket.io";
import Auth from "./Auth";
import GameRepository from "./GameRepository";
import GameState from "./GameState";
import JoinTokens from "./JoinTokens";
import { Update } from "../helpers/diff";
import { Map } from "../types/Map";
import { MapState } from "../types/MapState";
import { PlayerState } from "../types/PlayerState";
import { Manifest } from "../types/Manifest";
import { Pointer } from "../types/Pointer";

export default class GameServer {
  private readonly io: IOServer;
  private gameRepo;
  private readonly joinTokens: JoinTokens;

  constructor(io: IOServer, joinTokens: JoinTokens) {
    this.io = io;
    this.joinTokens = joinTokens;
    this.gameRepo = new GameRepository();
  }

  public initaliseSocketServer(httpServer: HttpServer) {
    this.io.listen(httpServer);
  }

  public run(): void {
    this.io.on("connect", async (socket: Socket) => {
      const gameState = new GameState(this.io, socket, this.gameRepo);
      let _gameId: string;
      let castDisplay = false;
      let joining = false;

      // Cast displays may only request read access. New write events are
      // refused here too, before any handler can change or forward state.
      socket.use(([event], next) => {
        if (
          castDisplay && event !== "get_display_token" && event !== "join_display"
        ) return;
        next();
      });

      socket.on("get_display_token", (answer: (token: string | null) => void) => {
        if (typeof answer !== "function") return;
        const gameId = gameState.getGameId();
        if (castDisplay || !gameId) {
          answer(null);
          return;
        }
        const player = this.gameRepo.getPartyState(gameId)[socket.id];
        const map = this.gameRepo.getState(gameId, "map") as Map | undefined;
        answer(
          player?.userId && map && player.userId === map.owner
            ? this.gameRepo.games[gameId].displayToken
            : null
        );
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
        castDisplay = true;
        _gameId = gameId;
        await gameState.joinGame(gameId, true);
        const token = this.joinTokens.issue(socket.id, gameId, "display");
        socket.emit("joined_display", socket.id, token);
      });

      socket.on("signal", (data: string) => {
        try {
          const { to, signal } = JSON.parse(data);
          this.io.to(to).emit("signal", { from: socket.id, signal });
        } catch (error) {
          console.error("SIGNAL_ERROR", error);
        }
      });

      socket.on("disconnecting", async () => {
        this.joinTokens.revoke(socket.id);
        if (castDisplay) return;
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

      socket.on("join_game", async (gameId: string, password: string) => {
        if (joining || castDisplay || gameState.getGameId()) return;
        joining = true;
        const auth = new Auth();

        try {
          if (typeof gameId !== "string" || typeof password !== "string") {
            console.log("invalid type in party credentials");
            socket.emit("auth_error");
            return;
          }

          const created = this.gameRepo.isGameCreated(gameId);
          if (!created) {
            // Create a game and join
            const hash = await auth.createPasswordHash(password);
            this.gameRepo.setGameCreation(gameId, hash);
            await gameState.joinGame(gameId);
          } else {
            // Join existing game
            const hash = this.gameRepo.getGamePasswordHash(gameId);
            const res = await auth.checkPassword(password, hash);
            if (res) {
              await gameState.joinGame(gameId);
            } else {
              socket.emit("auth_error");
              return;
            }
          }
          _gameId = gameId;
          // Only the player who joined gets the token for the asset routes
          const token = this.joinTokens.issue(socket.id, gameId);
          socket.emit("joined_game", socket.id, token);
          socket.to(gameId).emit("joined_game", socket.id);
        } catch (error) {
          console.error("JOIN_ERROR", error);
        } finally {
          joining = false;
        }
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

          this.gameRepo.setPlayerState(gameId, playerState, socket.id);
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
