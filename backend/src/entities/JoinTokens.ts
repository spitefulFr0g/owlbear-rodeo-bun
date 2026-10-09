import { randomBytes } from "crypto";

/**
 * Tokens that prove a client has joined a game. One is issued per socket on
 * `joined_game` or `joined_display` and stops working when that socket disconnects. HTTP routes
 * use them to check read and write access.
 */
export default class JoinTokens {
  private readonly gameByToken = new Map<
    string, { gameId: string; role: "player" | "display" }
  >();
  private readonly tokenBySocket = new Map<string, string>();

  /** Issues a token for a socket, replacing any it held before */
  issue(
    socketId: string,
    gameId: string,
    role: "player" | "display" = "player"
  ): string {
    this.revoke(socketId);
    const token = randomBytes(32).toString("base64url");
    this.gameByToken.set(token, { gameId, role });
    this.tokenBySocket.set(socketId, token);
    return token;
  }

  canUpload(token: string): boolean {
    return this.gameByToken.get(token)?.role === "player";
  }

  revoke(socketId: string): void {
    const token = this.tokenBySocket.get(socketId);
    if (token) {
      this.gameByToken.delete(token);
      this.tokenBySocket.delete(socketId);
    }
  }

  /** @returns the id of the game the token was issued for, if it is valid */
  verify(token: string): string | undefined {
    return this.gameByToken.get(token)?.gameId;
  }
}
