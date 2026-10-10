import { useEffect, useRef } from "react";
import { useToasts } from "react-toast-notifications";

import Session from "./Session";

import { useParty } from "../contexts/PartyContext";

import SessionButton from "../components/SessionButton";
import RoomSettingsButton from "../components/RoomSettingsButton";
import Party from "../components/party/Party";

/**
 * @typedef {object} NetworkedPartyProps
 * @property {string} gameId
 * @property {Session} session
 */

type NetworkedPartyProps = { gameId: string; session: Session };

/**
 * @param {NetworkedPartyProps} props
 */
function NetworkedParty({ gameId, session }: NetworkedPartyProps) {
  const partyState = useParty();
  const { addToast } = useToasts();

  // Keep a reference to players who have just joined to show the joined notification
  const joinedPlayersRef = useRef<string[]>([]);
  useEffect(() => {
    if (joinedPlayersRef.current.length > 0) {
      for (let id of joinedPlayersRef.current) {
        if (partyState[id]) {
          addToast(`${partyState[id].nickname} joined the party`);
        }
      }
      joinedPlayersRef.current = [];
    }
  }, [partyState, addToast]);

  useEffect(() => {
    function handlePlayerJoined(sessionId: string) {
      // Add player to join notification list
      // Can't just show the notification here as the partyState data isn't populated at this point
      joinedPlayersRef.current.push(sessionId);
    }

    function handlePlayerLeft(sessionId: string) {
      if (partyState[sessionId]) {
        addToast(`${partyState[sessionId].nickname} left the party`);
      }
    }

    session.on("playerJoined", handlePlayerJoined);
    session.on("playerLeft", handlePlayerLeft);

    return () => {
      session.off("playerJoined", handlePlayerJoined);
      session.off("playerLeft", handlePlayerLeft);
    };
  });

  return (
    <Party
      gameId={gameId}
      onTrustChange={(playerId, trusted) => {
        session.socket?.emit("room_trust", playerId, trusted, (result: { ok: boolean }) => {
          if (!result.ok) {
            addToast("The trusted mark could not be changed.", { appearance: "error" });
          }
        });
      }}
      roomSettings={<><SessionButton session={session} /><RoomSettingsButton session={session} /></>}
    />
  );
}

export default NetworkedParty;
