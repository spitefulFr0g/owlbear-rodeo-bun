import useSceneMap from "../../hooks/useSceneMap";
import { useState } from "react";
import { IconButton } from "theme-ui";

import SelectMapModal from "../../modals/SelectMapModal";
import SelectMapIcon from "../../icons/SelectMapIcon";

import { useMapData } from "../../contexts/MapDataContext";
import { useUserId } from "../../contexts/UserIdContext";
import {
  MapChangeEventHandler,
  MapResetEventHandler,
} from "../../types/Events";
import { Map } from "../../types/Map";
import { MapState } from "../../types/MapState";

type SelectMapButtonProps = {
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  currentMap: Map | null;
  currentMapState: MapState | null;
  disabled: boolean;
};

function SelectMapButton({
  onMapChange,
  onMapReset,
  currentMap,
  currentMapState,
  disabled,
}: SelectMapButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { updateMapState, mapsById } = useMapData();
  const { placed } = useSceneMap();
  const pickedLibraryMap = placed ? mapsById[placed.metadata.pickerMapId as string] || null : null;
  const userId = useUserId();
  function openModal() {
    if (currentMapState && currentMap && currentMap.owner === userId) {
      updateMapState(currentMapState.mapId, currentMapState);
    }
    setIsModalOpen(true);
  }

  function handleDone() {
    setIsModalOpen(false);
  }

  return (
    <>
      <IconButton
        aria-label="Select Map"
        title="Select Map"
        onClick={openModal}
        disabled={disabled}
      >
        <SelectMapIcon />
      </IconButton>
      <SelectMapModal
        isOpen={isModalOpen}
        onDone={handleDone}
        onMapChange={onMapChange}
        onMapReset={onMapReset}
        currentMap={pickedLibraryMap}
      />
    </>
  );
}

export default SelectMapButton;
