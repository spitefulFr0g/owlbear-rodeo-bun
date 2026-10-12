import React, { useState, useEffect, useContext } from "react";
import Session from "../network/Session";

import { PresenceState } from "../sceneRules";

/** The presences of everyone else in the room */
const PartyContext = React.createContext<PresenceState | undefined>(undefined);

type PartyProviderProps = {
  session: Session;
  children: React.ReactNode;
};

export function PartyProvider({ session, children }: PartyProviderProps) {
  const [partyState, setPartyState] = useState<PresenceState>({});

  useEffect(() => {
    function handleSocketPartyState(partyState: PresenceState) {
      if (partyState && session.id) {
        const { [session.id]: _, ...otherMembersState } = partyState;
        setPartyState(otherMembersState);
      } else {
        setPartyState({});
      }
    }

    session.socket?.on("presence_state", handleSocketPartyState);

    return () => {
      session.socket?.off("presence_state", handleSocketPartyState);
    };
  });

  return (
    <PartyContext.Provider value={partyState}>{children}</PartyContext.Provider>
  );
}

export function useParty() {
  const context = useContext(PartyContext);
  if (context === undefined) {
    throw new Error("useParty must be used within a PartyProvider");
  }
  return context;
}

export default PartyContext;
