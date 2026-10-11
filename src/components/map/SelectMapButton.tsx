import useSceneMap from "../../hooks/useSceneMap";
import { useState } from "react";
import { IconButton } from "theme-ui";

import SelectMapModal from "../../modals/SelectMapModal";
import SelectMapIcon from "../../icons/SelectMapIcon";

import { useMapData } from "../../contexts/MapDataContext";
import { MapChangeEventHandler } from "../../types/Events";

type SelectMapButtonProps = {
  onMapChange: MapChangeEventHandler;
  disabled: boolean;
};

function SelectMapButton({
  onMapChange,
  disabled,
}: SelectMapButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { mapsById } = useMapData();
  const { placed } = useSceneMap();
  const pickedLibraryMap = placed ? mapsById[placed.metadata.pickerMapId as string] || null : null;
  function openModal() {
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
        currentMap={pickedLibraryMap}
      />
    </>
  );
}

export default SelectMapButton;
