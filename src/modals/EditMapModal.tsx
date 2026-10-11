import useSceneMap from "../hooks/useSceneMap";
import { useState } from "react";
import { Button, Flex, Label, useThemeUI } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import MapSettings from "../components/map/MapSettings";
import MapEditor from "../components/map/MapEditor";

import { isEmpty } from "../helpers/shared";
import { getGridDefaultInset } from "../helpers/grid";

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
  const sceneMap = useSceneMap();

  function handleClose() {
    setMapSettingChanges({});
    onDone();
  }

  async function handleSave() {
    await applyMapChanges();
    onDone();
  }

  /**
   * Map settings
   */
  // Local cache of map setting changes
  // Applied when done is clicked or map selection is changed
  const [mapSettingChanges, setMapSettingChanges] = useState<Partial<Map>>({});

  function handleMapSettingsChange(change: Partial<Map>) {
    setMapSettingChanges((prevChanges) => ({
      ...prevChanges,
      ...change,
    }));
  }

  async function applyMapChanges() {
    if (!isEmpty(mapSettingChanges)) {
      // Ensure grid values are positive
      let verifiedChanges: Partial<Map> = { ...mapSettingChanges };
      if (verifiedChanges.grid) {
        verifiedChanges.grid.size.x = Math.max(1, verifiedChanges.grid.size.x || 1);
        verifiedChanges.grid.size.y = Math.max(1, verifiedChanges.grid.size.y || 1);
      }
      // Ensure inset isn't flipped
      if (verifiedChanges.grid) {
        const inset = verifiedChanges.grid.inset;
        if (
          inset.topLeft.x >= inset.bottomRight.x ||
          inset.topLeft.y >= inset.bottomRight.y
        ) {
          verifiedChanges.grid.inset = getGridDefaultInset(
            { size: verifiedChanges.grid.size, type: verifiedChanges.grid.type },
            map.width,
            map.height
          );
        }
      }
      await onUpdateMap(map.id, verifiedChanges);
      sceneMap.edit({ ...map, ...verifiedChanges } as Map);

      setMapSettingChanges({});
    }
  }

  const selectedMapWithChanges =
    map &&
    ({
      ...map,
      ...mapSettingChanges,
    } as Map);

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
            map={selectedMapWithChanges}
            onSettingsChange={handleMapSettingsChange}
          />
          <MapSettings
            map={selectedMapWithChanges}
            onSettingsChange={handleMapSettingsChange}
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
