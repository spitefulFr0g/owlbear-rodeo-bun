import { useState, useEffect } from "react";

import Session from "./Session";

import { useRoom } from "../contexts/RoomContext";
import WelcomeScreen from "../components/WelcomeScreen";
import DisplayMap from "../components/display/DisplayMap";

import { DisplayView } from "../helpers/displayView";

import { useScene } from "../scene/SceneContext";
import { defaultDisplayView } from "../helpers/defaultDisplayView";

/**
 * The map of a room as a cast display receives it. Nothing is ever sent back.
 */
function NetworkedDisplay({ session }: { session: Session }) {
  const { scene } = useScene();
  const waiting = useRoom().session === false;
  // The view of the GM being followed
  const [displayView, setDisplayView] = useState<DisplayView | null>(null);

  useEffect(() => {
    function handleSocketDisplayView(view?: DisplayView) {
      setDisplayView(view || null);
    }

    session.socket?.on("display_view", handleSocketDisplayView);

    return () => {
      session.socket?.off("display_view", handleSocketDisplayView);
    };
  });

  useEffect(() => {
    function clearOutsideSession() {
      if (session.room.session === false) {
        setDisplayView(null);
      }
    }
    session.on("room", clearOutsideSession);
    return () => { session.off("room", clearOutsideSession); };
  }, [session]);

  if (waiting) return <WelcomeScreen />;

  // Fit the scene until a view of it arrives
  const view =
    displayView && scene && displayView.sceneId === scene.id
      ? displayView
      : defaultDisplayView(scene);

  return (
    <DisplayMap
      view={view}
      session={session}
    />
  );
}

export default NetworkedDisplay;
