import { useState, useEffect } from "react";

import useNetworkedState from "../hooks/useNetworkedState";
import useAssetTransfers from "../hooks/useAssetTransfers";

import Session from "./Session";

import { useRoom } from "../contexts/RoomContext";
import WelcomeScreen from "../components/WelcomeScreen";
import DisplayMap from "../components/display/DisplayMap";

import { DisplayView, fullMapRect } from "../helpers/displayView";

import { Map as MapType } from "../types/Map";
import { MapState } from "../types/MapState";
import { AssetManifest } from "../types/Asset";

/**
 * The map of a room as a cast display receives it. Nothing is ever sent back.
 */
function NetworkedDisplay({ session }: { session: Session }) {
  const waiting = useRoom().session === false;
  const [currentMap, setCurrentMap] = useState<MapType | null>(null);
  const [currentMapState, setCurrentMapState] = useNetworkedState<MapState | null>(
    null,
    session,
    "map_state",
    500,
    true,
    "mapId"
  );
  const [assetManifest, setAssetManifest] = useNetworkedState<AssetManifest | null>(
    null,
    session,
    "manifest",
    500,
    true,
    "mapId"
  );

  // A cast display belongs to nobody, so every asset is loaded from the server
  useAssetTransfers(session, assetManifest, undefined, true);

  // The view of the player being followed
  const [displayView, setDisplayView] = useState<DisplayView | null>(null);

  useEffect(() => {
    function handleSocketMap(map?: MapType) {
      setCurrentMap(map || null);
    }

    function handleSocketDisplayView(view?: DisplayView) {
      setDisplayView(view || null);
    }

    session.socket?.on("map", handleSocketMap);
    session.socket?.on("display_view", handleSocketDisplayView);

    return () => {
      session.socket?.off("map", handleSocketMap);
      session.socket?.off("display_view", handleSocketDisplayView);
    };
  });

  useEffect(() => {
    function clearOutsideSession() {
      if (session.room.session === false) {
        setCurrentMap(null);
        setCurrentMapState(null, false);
        setAssetManifest(null, false);
        setDisplayView(null);
      }
    }
    session.on("room", clearOutsideSession);
    return () => { session.off("room", clearOutsideSession); };
  }, [session, setCurrentMapState, setAssetManifest]);

  if (waiting) return <WelcomeScreen />;

  // Show the whole map until a view of it arrives
  const view =
    displayView && currentMap && displayView.mapId === currentMap.id
      ? displayView
      : fullMapRect;

  return (
    <DisplayMap
      map={currentMap}
      mapState={currentMapState}
      view={view}
      session={session}
    />
  );
}

export default NetworkedDisplay;
