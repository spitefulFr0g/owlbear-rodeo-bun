import { useState } from "react";
import { IconButton } from "theme-ui";

import ScenesModal from "../../modals/ScenesModal";
import SelectMapIcon from "../../icons/SelectMapIcon";

import { useSceneList } from "../../scene/SceneContext";

/** Opens the Scenes dialog, for the GM */
function ScenesButton() {
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
      />
    </>
  );
}

export default ScenesButton;
