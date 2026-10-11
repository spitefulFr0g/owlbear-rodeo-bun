import { useState } from "react";
import { Box, Button, Label } from "theme-ui";

import Modal from "../components/Modal";
import SceneList from "../components/scene/SceneList";

import SelectMapModal from "./SelectMapModal";

import useSceneMap from "../hooks/useSceneMap";
import { useMapData } from "../contexts/MapDataContext";

import {
  MapChangeEventHandler,
  RequestCloseEventHandler,
} from "../types/Events";

type ScenesModalProps = {
  isOpen: boolean;
  onDone: RequestCloseEventHandler;
  onMapChange: MapChangeEventHandler;
  allowMapChange: boolean;
};

/** The GM's scenes. A stand-in for the dock's Scenes tab. */
function ScenesModal({
  isOpen,
  onDone,
  onMapChange,
  allowMapChange,
}: ScenesModalProps) {
  // Until the importer, the map picker changes the map of the scene being viewed
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const { mapsById } = useMapData();
  const { placed } = useSceneMap();
  const pickedLibraryMap = placed ? mapsById[placed.metadata.pickerMapId as string] || null : null;

  function handleMapPickerDone() {
    setIsMapPickerOpen(false);
    onDone();
  }

  return (
    <>
      <Modal
        contentLabel="Scenes"
        isOpen={isOpen && !isMapPickerOpen}
        onRequestClose={onDone}
        style={{ content: { maxWidth: "480px", width: "100%" } }}
      >
        <Box>
          <Label py={2}>Scenes</Label>
          <SceneList onDone={onDone} />
          <Button
            type="button"
            sx={{ width: "100%" }}
            mt={3}
            disabled={!allowMapChange}
            onClick={() => setIsMapPickerOpen(true)}
          >
            Change the map of the scene you are viewing
          </Button>
        </Box>
      </Modal>
      <SelectMapModal
        isOpen={isOpen && isMapPickerOpen}
        onDone={handleMapPickerDone}
        onMapChange={onMapChange}
        currentMap={pickedLibraryMap}
      />
    </>
  );
}

export default ScenesModal;
