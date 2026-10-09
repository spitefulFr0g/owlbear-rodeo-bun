import { Server } from "socket.io";
import { FsAssetStore } from "../entities/AssetStore";
import GameRepository from "../entities/GameRepository";

/** Authorization belongs to the caller; administrators use this same deletion. */
export function roomDeletion(assets: FsAssetStore, rooms: GameRepository, io: Server): (roomId: string) => Promise<void> {
  return roomId => assets.deleteRoom(roomId, () => {
    rooms.forgetRoom(roomId);
    io.to(roomId).emit("room_deleted");
    io.in(roomId).disconnectSockets(true);
  });
}
