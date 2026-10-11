import { Box, Label } from "theme-ui";

import Modal from "../components/Modal";
import SceneList from "../components/scene/SceneList";

import { RequestCloseEventHandler } from "../types/Events";

type ScenesModalProps = {
  isOpen: boolean;
  onDone: RequestCloseEventHandler;
};

/** The GM's scenes. A stand-in for the dock's Scenes tab. */
function ScenesModal({ isOpen, onDone }: ScenesModalProps) {
  return (
    <Modal
      contentLabel="Scenes"
      isOpen={isOpen}
      onRequestClose={onDone}
      style={{ content: { maxWidth: "400px", width: "100%" } }}
    >
      <Box>
        <Label py={2}>Scenes</Label>
        <SceneList onDone={onDone} />
      </Box>
    </Modal>
  );
}

export default ScenesModal;
