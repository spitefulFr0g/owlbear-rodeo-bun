import { useState, useEffect, useRef } from "react";
import { Flex, Text } from "theme-ui";
import { useParams } from "react-router-dom";
import Konva from "konva";

import ReconnectBanner from "../components/banner/ReconnectBanner";
import OfflineBanner from "../components/banner/OfflineBanner";
import LoadingOverlay from "../components/LoadingOverlay";
import MapLoadingOverlay from "../components/map/MapLoadingOverlay";

import { MapStageProvider } from "../contexts/MapStageContext";
import { useDatabase } from "../contexts/DatabaseContext";
import { PartyProvider } from "../contexts/PartyContext";
import { AssetsProvider, AssetURLsProvider } from "../contexts/AssetsContext";
import { MapLoadingProvider } from "../contexts/MapLoadingContext";

import NetworkedDisplay from "../network/NetworkedDisplay";

import Session, { SessionStatus } from "../network/Session";

// Time without the mouse moving before the cursor is hidden (ms)
const cursorHideDelay = 2000;

/**
 * A room opened from its display link: the map filling the window and nothing else.
 * It has no user id, so it owns nothing even in the browser of the person who does.
 */
function Display() {
  const { id: gameId }: { id: string } = useParams();
  const { databaseStatus } = useDatabase();

  const [session] = useState(new Session());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>();

  useEffect(() => {
    function handleStatus(status: SessionStatus) {
      setSessionStatus(status);
    }

    session.on("status", handleStatus);

    return () => {
      session.off("status", handleStatus);
    };
  }, [session]);

  // Join as a cast display, the display link carries the token after the #
  useEffect(() => {
    if (
      sessionStatus === "ready" &&
      (databaseStatus === "loaded" || databaseStatus === "disabled")
    ) {
      session.joinDisplay(gameId, window.location.hash.slice(1));
    }
  }, [gameId, databaseStatus, session, sessionStatus]);

  useEffect(() => {
    session.connect();

    return () => {
      session.disconnect();
    };
  }, [session]);

  useEffect(() => {
    const title = document.title;
    document.title = `Display - ${title}`;
    return () => {
      document.title = title;
    };
  }, []);

  // Keep a resting cursor off the shared screen
  const [cursorHidden, setCursorHidden] = useState(false);
  useEffect(() => {
    let timeout = setTimeout(() => setCursorHidden(true), cursorHideDelay);
    function handleMouseMove() {
      setCursorHidden(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setCursorHidden(true), cursorHideDelay);
    }
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // A ref to the Konva stage
  // the ref will be assigned in the MapInteraction component
  const mapStageRef = useRef<Konva.Stage | null>(null);

  if (sessionStatus === "display_error") {
    return (
      <Flex
        sx={{
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          textAlign: "center",
        }}
        p={4}
      >
        <Text variant="heading" as="h1" sx={{ fontSize: 5 }}>
          This display link no longer works
        </Text>
        <Text as="p" variant="body2" mt={2} sx={{ maxWidth: "420px" }}>
          Open the game and use the display button to get a new one.
        </Text>
      </Flex>
    );
  }

  return (
    <AssetsProvider>
      <AssetURLsProvider>
        <MapLoadingProvider>
          <PartyProvider session={session}>
            <MapStageProvider value={mapStageRef}>
              <Flex
                sx={{
                  flexGrow: 1,
                  height: "100%",
                  cursor: cursorHidden ? "none" : "default",
                  userSelect: "none",
                }}
              >
                <NetworkedDisplay session={session} />
              </Flex>
              <OfflineBanner isOpen={sessionStatus === "offline"} />
              <ReconnectBanner isOpen={sessionStatus === "reconnecting"} />
              {(!sessionStatus || sessionStatus === "joining") && (
                <LoadingOverlay />
              )}
              <MapLoadingOverlay />
            </MapStageProvider>
          </PartyProvider>
        </MapLoadingProvider>
      </AssetURLsProvider>
    </AssetsProvider>
  );
}

export default Display;
