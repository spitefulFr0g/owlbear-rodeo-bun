import { Scene, defaultSceneGrid } from "../../../src/sceneRules";
import { RoomSwitches } from "../types/RoomSwitches";
import { randomBytes } from "crypto";
import { DisplayView } from "../types/DisplayView";
import { PlayerState } from "../types/PlayerState";
import { PartyState } from "../types/PartyState";

export type StoredScene = Scene & { name: string };

export default class Game {
  openSceneId = randomBytes(16).toString("hex");
  welcomeSceneId: string | null = null;
  scenes: Record<string, StoredScene> = {
    [this.openSceneId]: { id: this.openSceneId, name: "Scene 1", grid: JSON.parse(JSON.stringify(defaultSceneGrid)), fogFill: false, viewOnly: false, items: {} },
  };

  get scene(): StoredScene { return this.scenes[this.openSceneId]; }
  set scene(scene: Scene) {
    this.scenes[this.openSceneId] = { ...scene, name: this.scenes[this.openSceneId].name };
  }
  name = "";
  session = false;
  cancelSessionCountdown?: () => void;
  switches: RoomSwitches = { tokens: true, drawing: true, notes: true, fog: false, uploads: false, ownerOnly: false };
  trustedPlayerIds = new Set<string>();
  gmAccountId: string | null = null;
  hasPassword = false;
  displayFrozen = false;
  latestDisplayView?: DisplayView;
  shownDisplayView?: DisplayView;
  displayToken: string;
  gameId: string;
  partyState: PartyState;
  passwordHash: string;

  constructor(gameId: string, hash: string, displayToken = randomBytes(32).toString("base64url")) {
    this.displayToken = displayToken;
    this.gameId = gameId;
    this.partyState = {};
    this.passwordHash = hash;
  }

  getPartyState(): PartyState {
    const result = this.partyState;
    return result;
  }

  getGamePasswordHash(): string {
    const result = this.passwordHash;
    return result;
  }

  setGamePasswordHash(hash: string): void {
    this.passwordHash = hash;
  }

  setPlayerState(playerState: PlayerState, playerId: string): void {
    this.partyState[playerId] = playerState;
  }

  deletePlayer(playerId: string): void {
    delete this.partyState[playerId];
  }
}
