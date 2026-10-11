import { Button, Flex, Label, useThemeUI } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import MapSettings from "../components/map/MapSettings";
import MapEditor from "../components/map/MapEditor";

import useMapEdits from "../hooks/useMapEdits";
import useResponsiveLayout from "../hooks/useResponsiveLayout";
import { Map } from "../types/Map";
import { UpdateMapEventHanlder } from "../contexts/MapDataContext";

type EditMapProps = {
  isOpen: boolean;
  onDone: () => void;
  map: Map;
  onUpdateMap: UpdateMapEventHanlder;
};

function EditMapModal({
  isOpen,
  onDone,
  map,
  onUpdateMap,
}: EditMapProps) {
  const { theme } = useThemeUI();
  const { edited, change, discard, save } = useMapEdits(map, onUpdateMap);

  function handleClose() {
    discard();
    onDone();
  }

  async function handleSave() {
    await save();
    onDone();
  }

  const layout = useResponsiveLayout();

  if (!map) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      style={{
        content: {
          maxWidth: layout.modalSize,
          width: "calc(100% - 16px)",
          padding: 0,
          display: "flex",
          overflow: "hidden",
        },
      }}
    >
      <Flex
        sx={{
          flexDirection: "column",
          width: "100%",
        }}
      >
        <Label pt={2} pb={1} px={3}>
          Edit map
        </Label>
        <SimpleBar
          style={{
            minHeight: 0,
            padding: "16px",
            backgroundColor: theme.colors?.muted as string,
            margin: "0 8px",
            height: "100%",
          }}
        >
          <MapEditor
            map={edited}
            onSettingsChange={change}
          />
          <MapSettings
            map={edited}
            onSettingsChange={change}
          />
        </SimpleBar>
        <Button m={3} onClick={handleSave}>
          Save
        </Button>
      </Flex>
    </Modal>
  );
}

export default EditMapModal;
