import React, { useContext, useEffect, useState } from "react";

import Session from "../network/Session";

import { Role, RoomState } from "../types/Room";

const RoomContext = React.createContext<RoomState>({});

// A page that never joined as a person, such as a cast display, changes nothing
export const RoleContext = React.createContext<Role>("player");

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

  const [role, setRole] = useState<Role>(session.role);
  useEffect(() => {
    session.on("role", setRole);
    return () => {
      session.off("role", setRole);
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

  return (
    <RoomContext.Provider value={room}>
      <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
    </RoomContext.Provider>
  );
}

export function useRoom() {
  return useContext(RoomContext);
}

/** The role the server gave this connection in the room */
export function useRole() {
  return useContext(RoleContext);
}

export default RoomContext;
