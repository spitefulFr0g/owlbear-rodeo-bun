import io, { Socket } from "socket.io-client";
import msgParser from "socket.io-msgpack-parser";
import { EventEmitter } from "events";

/** Handles the connection to the server. */
class Session extends EventEmitter {
  /**
   * The socket io connection
   */
  socket?: Socket;

  get id() {
    return this.socket?.id;
  }

  /**
   * The server the session is connected to
   */
  brokerUrl: string = "";

  /**
   * Proof that we have joined a game, needed to use the server's asset store.
   * Only set while joined.
   */
  joinToken?: string;

  /**
   * When the server will take a room password again, in milliseconds since
   * the epoch. Set while it refuses them after too many wrong ones.
   */
  authWaitUntil?: number;

  // Store party id and password for reconnect
  _gameId: string = "";
  _password: string = "";
  // Set when joined as a cast display
  _displayToken?: string;

  /**
   * Connect to the websocket
   */
  async connect() {
    try {
      if (process.env.REACT_APP_MAINTENANCE === "true") {
        this.emit("status", "offline");
        return;
      }
      // The server hosts the frontend, so connect back to the same origin
      // unless a separate broker is configured (e.g. the CRA dev server)
      const brokerUrl =
        process.env.REACT_APP_BROKER_URL || window.location.origin;
      this.brokerUrl = brokerUrl;
      this.socket = io(brokerUrl, {
        withCredentials: true,
        parser: msgParser,
        transports: ["websocket"],
      });
      this.socket.on("player_joined", this._handlePlayerJoined.bind(this));
      this.socket.on("player_left", this._handlePlayerLeft.bind(this));
      this.socket.on("joined_game", this._handleJoinedGame.bind(this));
      this.socket.on("joined_display", this._handleJoinedDisplay.bind(this));
      this.socket.on("display_error", this._handleDisplayError.bind(this));
      this.socket.on("auth_error", this._handleAuthError.bind(this));
      this.socket.on("auth_wait", this._handleAuthWait.bind(this));
      this.socket.on("game_expired", this._handleGameExpired.bind(this));
      this.socket.on("disconnect", this._handleSocketDisconnect.bind(this));
      this.socket.io.on("reconnect", this._handleSocketReconnect.bind(this));
      this.socket.on("force_update", this._handleForceUpdate.bind(this));

      this.emit("status", "ready");
    } catch (error: any) {
      this.emit("status", "offline");
    }
  }

  disconnect() {
    this.socket?.disconnect();
  }

  /**
   * Join a party
   *
   * @param {string} gameId - the id of the party to join
   * @param {string} password - the password of the party
   */
  async joinGame(gameId: string, password: string) {
    if (typeof gameId !== "string" || typeof password !== "string") {
      console.error(
        "Unable to join game: invalid game ID or password",
        gameId,
        password
      );
      return;
    }

    this._gameId = gameId;
    this._password = password;
    this.socket?.emit(
      "join_game",
      gameId,
      password,
      process.env.REACT_APP_VERSION
    );
    this.emit("status", "joining");
  }

  /**
   * Join a party as a cast display
   *
   * @param {string} gameId - the id of the party to join
   * @param {string} displayToken - the token from the party's display link
   */
  joinDisplay(gameId: string, displayToken: string) {
    this._gameId = gameId;
    this._displayToken = displayToken;
    this.socket?.emit("join_display", gameId, displayToken);
    this.emit("status", "joining");
  }

  _handleJoinedDisplay(_id: string, token: string) {
    this.joinToken = token;
    this.emit("status", "joined");
  }

  // The display link was refused
  _handleDisplayError() {
    this.emit("status", "display_error");
  }

  // Sent when anyone joins the game, the token only comes with our own join
  _handleJoinedGame(_id: string, token?: string) {
    if (token) {
      this.joinToken = token;
    }
    this.emit("status", "joined");
  }

  _handleGameExpired() {
    this.emit("gameExpired");
  }

  _handlePlayerJoined(id: string) {
    this.emit("playerJoined", id);
  }

  _handlePlayerLeft(id: string) {
    this.emit("playerLeft", id);
  }

  _handleAuthError() {
    this.emit("status", "auth");
  }

  // Too many wrong passwords, even the right one is refused for a while
  _handleAuthWait(retryAfterSeconds: number) {
    this.authWaitUntil = Date.now() + retryAfterSeconds * 1000;
    this.emit("status", "auth");
  }

  _handleSocketDisconnect() {
    // The server forgets the token when the socket disconnects
    this.joinToken = undefined;
    this.emit("status", "reconnecting");
  }

  _handleSocketReconnect() {
    if (this.socket) this.socket.sendBuffer = [];
    if (this._gameId && this._displayToken !== undefined) {
      this.joinDisplay(this._gameId, this._displayToken);
    } else if (this._gameId) {
      this.joinGame(this._gameId, this._password);
    }
  }

  _handleForceUpdate() {
    this.socket?.disconnect();
    this.emit("status", "needs_update");
  }
}

export type SessionStatus =
  | "ready"
  | "joining"
  | "joined"
  | "offline"
  | "reconnecting"
  | "auth"
  | "display_error"
  | "needs_update";
export type SessionStatusHandler = (status: SessionStatus) => void;

export type PlayerJoinedHandler = (id: string) => void;
export type PlayerLeftHandler = (id: string) => void;
export type GameExpiredHandler = () => void;

declare interface Session {
  /** Session Status Event - Status of the session has changed */
  on(event: "status", listener: SessionStatusHandler): this;
  /** Player Joined Event - A player has joined the game */
  on(event: "playerJoined", listener: PlayerJoinedHandler): this;
  /** Player Left Event - A player has left the game */
  on(event: "playerLeft", listener: PlayerLeftHandler): this;
  /** Game Expired Event - A joining game has expired */
  on(event: "gameExpired", listener: GameExpiredHandler): this;
}

export default Session;
