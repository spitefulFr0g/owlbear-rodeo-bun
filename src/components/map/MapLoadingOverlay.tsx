import { Box } from "theme-ui";

import { useMapLoading } from "../../contexts/MapLoadingContext";

import { useRole, useRoom } from "../../contexts/RoomContext";
import LoadingBar from "../LoadingBar";

function MapLoadingOverlay() {
  const { isLoading, loadingProgressRef } = useMapLoading();

  const room = useRoom();
  const role = useRole();
  const waiting = room.session === false && role !== "gm";

  if (!isLoading || waiting) {
    return null;
  }

  return (
      <Box
        sx={{
          position: "absolute",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          top: 0,
          left: 0,
          right: 0,
          flexDirection: "column",
          zIndex: 2,
        }}
        bg="overlay"
      >
        <LoadingBar
          isLoading={isLoading}
          loadingProgressRef={loadingProgressRef}
        />
      </Box>
    );
}

export default MapLoadingOverlay;
