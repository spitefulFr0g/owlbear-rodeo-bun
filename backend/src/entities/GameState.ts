import { Server, Socket } from "socket.io";
import GameRepository from "./GameRepository";

export default class GameState {
  io: Server;
  socket: Socket;
  gameRepository: GameRepository;

  constructor(io: Server, socket: Socket, gameRepository: GameRepository) {
    this.io = io;
    this.socket = socket;
    this.gameRepository = gameRepository;
  }

  getGameId(): string | undefined {
    let gameId;
    for (const room of this.socket.rooms) {
      if (room !== this.socket.id) {
        gameId = room;
      }
    }
    return gameId;
  }

  async joinGame(gameId: string, castDisplay = false): Promise<void> {
    await this.socket.join(gameId);

    if (!castDisplay) this.socket.to(gameId).emit("player_joined", this.socket.id);
  }
}
