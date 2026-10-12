import React, { useEffect, useContext, useState, useRef } from "react";

import { useDatabase } from "./DatabaseContext";

import useDebounce from "../hooks/useDebounce";
import Session, { SessionStatus } from "../network/Session";
import { presenceUpdate } from "../helpers/presenceUpdate";
import { PresenceUpdate } from "../sceneRules";
import { PlayerState } from "../types/PlayerState";

type SetPlayerState = React.Dispatch<React.SetStateAction<PlayerState>>;

export const PlayerStateContext = React.createContext<PlayerState | undefined>(
  undefined
);
export const PlayerUpdaterContext = React.createContext<
  SetPlayerState | undefined
>(undefined);

type PlayerProviderProps = {
  session: Session;
  children: React.ReactNode;
};

export function PlayerProvider({ session, children }: PlayerProviderProps) {
  const { database, databaseStatus } = useDatabase();

  const [playerState, setPlayerState] = useState<PlayerState>({
    nickname: "",
    color: session.color,
    timer: undefined,
    dice: { share: false, rolls: [] },
  });
  const playerStateRef = useRef(playerState);
  playerStateRef.current = playerState;

  // The presence last sent on this connection, so a change that sends
  // nothing new, like a roll with sharing off, is not sent again
  const sentRef = useRef<string>();
  const sendRef = useRef((update: PresenceUpdate | undefined) => {
    const presence = update && JSON.stringify(update);
    if (!presence || presence === sentRef.current) return;
    sentRef.current = presence;
    session.socket?.emit("presence_update", update);
  });

  // The connection this browser's presence was last started on
  const joinedIdRef = useRef<string>();

  const update = presenceUpdate(playerState);
  const presence = useDebounce(update && JSON.stringify(update), 500);
  useEffect(() => {
    if (joinedIdRef.current && presence) sendRef.current(JSON.parse(presence));
  }, [presence]);

  // The server starts each connection with an unnamed presence, so the first
  // join and every rejoin send this browser's own straight away
  useEffect(() => {
    function handleStatus(status: SessionStatus) {
      // Also sent when someone else joins
      if (status !== "joined" || !session.id || joinedIdRef.current === session.id) return;
      joinedIdRef.current = session.id;
      sentRef.current = undefined;
      const color = session.color;
      setPlayerState((prevState) => prevState.color === color ? prevState : { ...prevState, color });
      sendRef.current(presenceUpdate({ ...playerStateRef.current, color }));
    }

    session.on("status", handleStatus);
    return () => {
      session.off("status", handleStatus);
    };
  }, [session]);

  useEffect(() => {
    if (!database || databaseStatus === "loading") {
      return;
    }
    async function loadNickname() {
      const storedNickname = await database?.table("user").get("nickname");
      if (storedNickname !== undefined) {
        setPlayerState((prevState) => ({
          ...prevState,
          nickname: storedNickname.value,
        }));
      }
    }

    loadNickname();
  }, [database, databaseStatus]);

  useEffect(() => {
    if (
      playerState.nickname &&
      database !== undefined &&
      (databaseStatus === "loaded" || databaseStatus === "disabled")
    ) {
      database
        .table("user")
        .update("nickname", { value: playerState.nickname });
    }
  }, [playerState, database, databaseStatus]);

  useEffect(() => {
    if (playerState.color) session.color = playerState.color;
  }, [playerState.color, session]);

  return (
    <PlayerStateContext.Provider value={playerState}>
      <PlayerUpdaterContext.Provider value={setPlayerState}>
        {children}
      </PlayerUpdaterContext.Provider>
    </PlayerStateContext.Provider>
  );
}

export function usePlayerState() {
  const context = useContext(PlayerStateContext);
  if (context === undefined) {
    throw new Error("usePlayerState must be used within a PlayerProvider");
  }
  return context;
}

export function usePlayerUpdater() {
  const context = useContext(PlayerUpdaterContext);
  if (context === undefined) {
    throw new Error("usePlayerUpdater must be used within a PlayerProvider");
  }
  return context;
}
