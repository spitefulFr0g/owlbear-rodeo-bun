import { useState } from "react";
import { IconButton } from "theme-ui";

import ScenesModal from "../../modals/ScenesModal";
import SelectMapIcon from "../../icons/SelectMapIcon";

import { useSceneList } from "../../scene/SceneContext";
import { MapChangeEventHandler } from "../../types/Events";

type ScenesButtonProps = {
  onMapChange: MapChangeEventHandler;
  allowMapChange: boolean;
};

/** Opens the Scenes dialog, for the GM */
function ScenesButton({ onMapChange, allowMapChange }: ScenesButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const sceneList = useSceneList();

  return (
    <>
      <IconButton
        aria-label="Scenes"
        title="Scenes"
        onClick={() => setIsModalOpen(true)}
        disabled={!sceneList}
      >
        <SelectMapIcon />
      </IconButton>
      <ScenesModal
        isOpen={isModalOpen}
        onDone={() => setIsModalOpen(false)}
        onMapChange={onMapChange}
        allowMapChange={allowMapChange}
      />
    </>
  );
}

export default ScenesButton;
