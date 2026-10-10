import { randomBytes } from "crypto";

/**
 * Tokens that prove a client has joined a game. One is issued per socket on
 * `joined_game` or `joined_display` and stops working when that socket disconnects. HTTP routes
 * use them to check read and write access.
 */
export default class JoinTokens {
  private readonly gameByToken = new Map<
    string, { gameId: string; role: "gm" | "player" | "display"; socketId: string }
  >();
  private readonly tokenBySocket = new Map<string, string>();

  /** Issues a token for a socket, replacing any it held before */
  issue(
    socketId: string,
    gameId: string,
    role: "gm" | "player" | "display" = "player"
  ): string {
    this.revoke(socketId);
    const token = randomBytes(32).toString("base64url");
    this.gameByToken.set(token, { gameId, role, socketId });
    this.tokenBySocket.set(socketId, token);
    return token;
  }

  // The room server resolves the live connection and room on each request.
  uploadAllowed?: (gameId: string, socketId: string) => boolean;

  canUpload(token: string): boolean {
    const connection = this.gameByToken.get(token);
    if (connection && this.uploadAllowed) return this.uploadAllowed(connection.gameId, connection.socketId);
    const role = this.gameByToken.get(token)?.role;
    return role === "gm" || role === "player";
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
