import { Clock } from "../clock";
import { OwlbearDatabase } from "../database";
import Game, { StoredScene } from "./Game";
import { defaultSceneGrid } from "../../../src/sceneRules";

export default class GameRepository {
  games: Record<string, Game>;

  private readonly pending = new globalThis.Map<string, { since: number; cancel: () => void }>();

  constructor(private readonly database?: OwlbearDatabase, private readonly clock?: Clock) {
    this.games = Object.create(null);
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
      if (record.switches) game.switches = { ...game.switches, ...JSON.parse(record.switches) };
      game.trustedPlayerIds = new Set(JSON.parse(record.trustedPlayerIds ?? "[]"));
      game.gmAccountId = record.gmAccountId;
      game.hasPassword = !!record.hasPassword;
      if (record.documentVersion === 2 || record.documentVersion === 3) {
        const document = JSON.parse(record.document);
        game.openSceneId = document.openSceneId;
        game.welcomeSceneId = record.documentVersion === 3 ? document.welcomeSceneId : null;
        game.scenes = Object.fromEntries(Object.entries(document.scenes).map(([id, value]) => {
          const scene = value as StoredScene;
          return [id, record.documentVersion === 3 ? { ...scene, movementMode: scene.movementMode ?? true } : {
            ...scene, name: "Scene 1", fogFill: false, viewOnly: false, movementMode: true,
            grid: { ...defaultSceneGrid, ...scene.grid },
          }];
        }));
      }
      this.games[gameId] = game;
    }

    return true;
  }

  changed(gameId: string): void {
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
      trustedPlayerIds: JSON.stringify([...game.trustedPlayerIds]),
      switches: JSON.stringify(game.switches), displayToken: game.displayToken, documentVersion: 3, document: JSON.stringify({ openSceneId: game.openSceneId, welcomeSceneId: game.welcomeSceneId, scenes: game.scenes }) });
    this.pending.get(gameId)?.cancel();
    this.pending.delete(gameId);
  }

  forgetRoom(roomId: string): void {
    this.games[roomId]?.cancelSessionCountdown?.();
    this.pending.get(roomId)?.cancel();
    this.pending.delete(roomId);
    delete this.games[roomId];
  }

  flush(): void {
    for (const gameId of this.pending.keys()) this.save(gameId);
  }

  roomState(gameId: string) {
    const game = this.games[gameId];
    return { name: game.name, switches: { ...game.switches }, session: game.session, hasPassword: game.hasPassword };
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
}
