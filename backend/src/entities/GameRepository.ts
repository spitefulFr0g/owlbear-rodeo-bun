import { Clock } from "../clock";
import { OwlbearDatabase } from "../database";
import { PlayerState } from "../types/PlayerState";
import { PartyState } from "../types/PartyState";
import { MapState } from "../types/MapState";
import { Manifest } from "../types/Manifest";
import { Map } from "../types/Map";
import Game from "./Game";

export default class GameRepository {
  games: Record<string, Game>;

  private readonly pending = new globalThis.Map<string, { since: number; cancel: () => void }>();

  constructor(private readonly database?: OwlbearDatabase, private readonly clock?: Clock) {
    this.games = {};
  }

  setGameCreation(gameId: string, hash: string): void {
    const game = new Game(gameId, hash);

    this.games[gameId] = game;
    this.changed(gameId);
  }

  isGameCreated(gameId: string): boolean {
    if (this.games[gameId] === undefined) {
      const record = this.database?.room(gameId);
      if (!record) return false;
      const game = new Game(gameId, record.passwordHash, record.displayToken);
      game.name = record.name;
      game.gmAccountId = record.gmAccountId;
      game.hasPassword = !!record.hasPassword;
      if (record.documentVersion === 1) game.state = JSON.parse(record.document);
      this.games[gameId] = game;
    }

    return true;
  }

  private changed(gameId: string): void {
    if (!this.database || !this.clock) return;
    const previous = this.pending.get(gameId);
    previous?.cancel();
    const since = previous?.since ?? this.clock.now();
    const delay = Math.min(3000, Math.max(0, since + 8000 - this.clock.now()));
    const cancel = this.clock.after(delay, () => this.save(gameId));
    this.pending.set(gameId, { since, cancel });
  }

  save(gameId: string): void {
    const game = this.games[gameId];
    this.database?.saveRoom({ id: game.gameId, passwordHash: game.passwordHash,
      name: game.name, gmAccountId: game.gmAccountId, hasPassword: Number(game.hasPassword),
      displayToken: game.displayToken, documentVersion: 1, document: JSON.stringify(game.state) });
    this.pending.get(gameId)?.cancel();
    this.pending.delete(gameId);
  }

  flush(): void {
    for (const gameId of this.pending.keys()) this.save(gameId);
  }

  getPartyState(gameId: string): PartyState {
    const game = this.games[gameId];

    const result = game.getPartyState();

    return result;
  }

  getGamePasswordHash(gameId: string): string {
    const game = this.games[gameId];

    const result = game.getGamePasswordHash();

    return result;
  }

  setGamePasswordHash(gameId: string, hash: string): void {
    const game = this.games[gameId];

    game.setGamePasswordHash(hash);
    this.changed(gameId);
  }

  setPlayerState(
    gameId: string,
    playerState: PlayerState,
    playerId: string
  ): void {
    const game = this.games[gameId];
    game.setPlayerState(playerState, playerId);
  }

  deletePlayer(gameId: string, playerId: string): void {
    const game = this.games[gameId];
    game.deletePlayer(playerId);
  }

  deleteGameData(gameId: string): void {
    const game = this.games[gameId];
    game.deleteGameData();
    this.changed(gameId);
  }

  setState(
    gameId: string,
    field: "map" | "mapState" | "manifest",
    value: any
  ): void {
    const game = this.games[gameId];
    game.setState(field, value);
    this.changed(gameId);
  }

  getState(
    gameId: string,
    field: "map" | "mapState" | "manifest"
  ): MapState | Manifest | Map {
    const game = this.games[gameId];
    const result = game.getState(field);
    return result;
  }
}
