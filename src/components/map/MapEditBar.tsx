import { useState } from "react";
import { Flex, Close, IconButton } from "theme-ui";

import { groupsFromIds, itemsFromGroups } from "../../helpers/group";

import ConfirmModal from "../../modals/ConfirmModal";

import RemoveMapIcon from "../../icons/RemoveMapIcon";

import { useGroup } from "../../contexts/GroupContext";
import { useMapData } from "../../contexts/MapDataContext";
import { useKeyboard } from "../../contexts/KeyboardContext";

import shortcuts from "../../shortcuts";

type MapEditBarProps = {
  disabled: boolean;
  onLoad: (loading: boolean) => void;
};

function MapEditBar({ disabled, onLoad }: MapEditBarProps) {
  const { maps, removeMaps } = useMapData();
  const { activeGroups, selectedGroupIds, onClearSelection } = useGroup();

  function getSelectedMaps() {
    const selectedGroups = groupsFromIds(selectedGroupIds, activeGroups);
    return itemsFromGroups(selectedGroups, maps);
  }

  const [isMapsRemoveModalOpen, setIsMapsRemoveModalOpen] = useState(false);
  async function handleMapsRemove() {
    onLoad(true);
    setIsMapsRemoveModalOpen(false);
    const selectedMaps = getSelectedMaps();
    const selectedMapIds = selectedMaps.map((map) => map.id);
    onClearSelection();
    await removeMaps(selectedMapIds);
    onLoad(false);
  }

  /**
   * Shortcuts
   */
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) {
      return;
    }
    if (shortcuts.delete(event)) {
      const selectedMaps = getSelectedMaps();
      if (selectedMaps.length > 0) {
        setIsMapsRemoveModalOpen(true);
      }
    }
  }

  useKeyboard(handleKeyDown);

  if (selectedGroupIds.length === 0) {
    return null;
  }

  return (
    <Flex
      sx={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: "space-between",
      }}
      bg="overlay"
    >
      <Close
        title="Clear Selection"
        aria-label="Clear Selection"
        onClick={() => onClearSelection()}
      />
      <Flex>
        <IconButton
          aria-label="Remove Selected Map(s)"
          title="Remove Selected Map(s)"
          onClick={() => setIsMapsRemoveModalOpen(true)}
        >
          <RemoveMapIcon />
        </IconButton>
      </Flex>
      <ConfirmModal
        isOpen={isMapsRemoveModalOpen}
        onRequestClose={() => setIsMapsRemoveModalOpen(false)}
        onConfirm={handleMapsRemove}
        confirmText="Remove"
        label="Remove Selected Map(s)"
        description="This operation cannot be undone."
      />
    </Flex>
  );
}

export default MapEditBar;
