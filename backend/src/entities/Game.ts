import { Scene, defaultSceneGrid } from "../../../src/sceneRules";
import { RoomSwitches } from "../types/RoomSwitches";
import { randomBytes } from "crypto";
import { DisplayView } from "../types/DisplayView";
import { PlayerState } from "../types/PlayerState";
import { PartyState } from "../types/PartyState";

export default class Game {
  scene: Scene = { id: randomBytes(16).toString("hex"), grid: JSON.parse(JSON.stringify(defaultSceneGrid)), items: {} };
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
