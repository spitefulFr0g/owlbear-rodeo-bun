import React, { useContext, useEffect, useState } from "react";

import Session from "../network/Session";

import { RoomState } from "../types/Room";

const RoomContext = React.createContext<RoomState>({});

type RoomProviderProps = {
  session: Session;
  children: React.ReactNode;
};

/** What the server says about the room this session has joined */
export function RoomProvider({ session, children }: RoomProviderProps) {
  const [room, setRoom] = useState<RoomState>(session.room);

  useEffect(() => {
    session.on("room", setRoom);
    return () => {
      session.off("room", setRoom);
    };
  }, [session]);

  // Name the browser tab after the room
  useEffect(() => {
    if (!room.name) {
      return;
    }
    const title = document.title;
    document.title = `${room.name} - ${title}`;
    return () => {
      document.title = title;
    };
  }, [room.name]);

  return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  return useContext(RoomContext);
}

export default RoomContext;
