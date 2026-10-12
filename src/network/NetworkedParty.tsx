import { useEffect, useRef } from "react";
import { useToasts } from "react-toast-notifications";

import { useScene } from "../scene/SceneContext";
import { useRole, useRoom } from "../contexts/RoomContext";
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
  const { scene } = useScene();
  const role = useRole();
  const room = useRoom();
  const waitingOnScene = role !== "gm" && room.session === false && !!scene;
  const partyState = useParty();
  const { addToast } = useToasts();

  // Keep a reference to players who have just joined to show the joined notification
  const joinedPlayersRef = useRef<string[]>([]);
  useEffect(() => {
    // A presence starts unnamed, so wait for the name its browser sends
    joinedPlayersRef.current = joinedPlayersRef.current.filter((id) => {
      if (!partyState[id]?.nickname) return true;
      addToast(`${partyState[id].nickname} joined the party`);
      return false;
    });
  }, [partyState, addToast]);

  useEffect(() => {
    function handlePlayerJoined(sessionId: string) {
      // Add player to join notification list
      // Can't just show the notification here as the presence isn't named at this point
      joinedPlayersRef.current.push(sessionId);
    }

    function handlePlayerLeft(sessionId: string) {
      joinedPlayersRef.current = joinedPlayersRef.current.filter((id) => id !== sessionId);
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

  if (waitingOnScene) return null;

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
