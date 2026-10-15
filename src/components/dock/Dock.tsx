import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { Box, Button, Flex, IconButton, Input, Select, Text } from "theme-ui";
import { useToasts } from "react-toast-notifications";
import {
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import DockTree from "./DockTree";
import DockRow from "./DockRow";
import DockMenu, { DockMenuTarget } from "./DockMenu";
import DockQuota from "./DockQuota";
import DockNameModal from "./DockNameModal";
import FloatingWindow from "../FloatingWindow";
import SceneList from "../scene/SceneList";

import SelectMapIcon from "../../icons/SelectMapIcon";
import TokenPropIcon from "../../icons/TokenPropIcon";
import TokenMountIcon from "../../icons/TokenMountIcon";
import TokenCharacterIcon from "../../icons/TokenCharacterIcon";
import TokenAttachmentIcon from "../../icons/TokenAttachmentIcon";
import GroupIcon from "../../icons/GroupIcon";
import DisplayPopoutIcon from "../../icons/DisplayPopoutIcon";

import DragContext, { CustomDragEndEvent } from "../../contexts/DragContext";
import { useLibrary } from "../../contexts/LibraryContext";
import { useRoom } from "../../contexts/RoomContext";
import { useServerStatus } from "../../contexts/ServerStatusContext";
import { useScene } from "../../scene/SceneContext";
import useSetting from "../../hooks/useSetting";
import usePreventSelect from "../../hooks/usePreventSelect";
import useLibraryPlacement from "../../hooks/useLibraryPlacement";
import { BundledLibraryAsset } from "../../helpers/serverSet";
import {
  DockTab,
  dockTabLabels,
  dockTabs,
  libraryFilters,
  mayFileIn,
  quotaBars,
  sectionColours,
} from "../../helpers/dock";
import {
  LibraryAsset,
  LibraryFilter,
  LibraryFolder,
  LibraryViewAsset,
  mayUpload,
} from "../../sceneRules/library";
import { defaultRoomSwitches } from "../../helpers/roomControls";

const tabIcons: Record<DockTab, React.ComponentType> = {
  map: SelectMapIcon,
  prop: TokenPropIcon,
  mount: TokenMountIcon,
  character: TokenCharacterIcon,
  attachment: TokenAttachmentIcon,
  scenes: GroupIcon,
};

const smallButton = { flexGrow: 1, flexBasis: 0, px: 1, py: "2px", fontSize: 0, minWidth: 0 };

function placeable(asset: LibraryViewAsset): LibraryAsset | BundledLibraryAsset {
  return asset as LibraryAsset | BundledLibraryAsset;
}

/**
 * The panel down the right of the room: a tab per asset type, each a tree of
 * the libraries a person may see, the GM's Scenes, and the quota bars
 */
function Dock() {
  const { person } = useScene();
  const room = useRoom();
  const { id: roomId } = useParams<{ id: string }>();
  // Account libraries are keyed by the signed-in account, not the browser
  const { account } = useServerStatus();
  const accountId = person.role === "gm" ? account?.id : undefined;
  const library = useLibrary();
  const place = useLibraryPlacement();
  const { addToast } = useToasts();
  const [fullScreen] = useSetting<boolean>("map.fullScreen");
  const [collapsed, setCollapsed] = useSetting<boolean>("dock.collapsed");

  const tabs = dockTabs(person.role);
  const [selectedTab, setTab] = useState<DockTab>();
  const tab = selectedTab && tabs.includes(selectedTab) ? selectedTab : tabs.find((value) => value !== "map") || tabs[0];
  const [collapseKey, setCollapseKey] = useState(0);
  const [menu, setMenu] = useState<DockMenuTarget | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [serverWindow, setServerWindow] = useState(false);
  const [dragAsset, setDragAsset] = useState<LibraryViewAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // The pointer, not the dragged row's middle, marks where a drop lands
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const showError = useCallback((message: string) => addToast(message, { appearance: "error" }), [addToast]);
  const bars = useMemo(() => quotaBars(library.usage, library.assets), [library.usage, library.assets]);

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { distance: 5 } });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);
  const [preventSelect, resumeSelect] = usePreventSelect();

  const trackPointer = useCallback((event: PointerEvent | TouchEvent) => {
    const point = "touches" in event ? event.touches[0] : event;
    if (point) pointerRef.current = { x: point.clientX, y: point.clientY };
  }, []);
  const stopTracking = useCallback(() => {
    window.removeEventListener("pointermove", trackPointer);
    window.removeEventListener("touchmove", trackPointer);
  }, [trackPointer]);
  useEffect(() => stopTracking, [stopTracking]);

  if (tabs.length === 0 || !tab) return null;

  function handlePlace(asset: LibraryViewAsset) {
    if (!place([placeable(asset)])) {
      showError(`${asset.name} could not be placed. Open a scene you may change first.`);
    }
  }

  function handleDragStart({ active }: DragStartEvent) {
    setDragAsset(active.data.current?.asset || null);
    preventSelect();
    pointerRef.current = null;
    window.addEventListener("pointermove", trackPointer);
    window.addEventListener("touchmove", trackPointer);
  }


  function handleDragEnd({ active, over, overlayNodeClientRect }: CustomDragEndEvent) {
    setDragAsset(null);
    resumeSelect();
    stopTracking();
    const asset: LibraryViewAsset | undefined = active.data.current?.asset;
    if (!asset) return;
    const folder = over && typeof over.id === "string" && over.id.startsWith("folder:")
      ? library.folders.find((candidate) => `folder:${candidate.id}` === over.id)
      : undefined;
    if (folder) {
      if ("files" in asset && mayFileIn(asset, folder) && asset.folderId !== folder.id) {
        library.command({ action: "edit", id: asset.id, changes: { folderId: folder.id } })
          .catch((error: Error) => showError(error.message));
      }
      return;
    }
    const point = pointerRef.current || (overlayNodeClientRect && {
      x: overlayNodeClientRect.left + overlayNodeClientRect.width / 2,
      y: overlayNodeClientRect.top + overlayNodeClientRect.height / 2,
    });
    // A drop that misses the canvas, such as one back on the dock, places nothing
    if (point) place([placeable(asset)], point);
  }

  function handleDragCancel() {
    setDragAsset(null);
    resumeSelect();
    stopTracking();
  }

  function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (tab === "scenes") return;
    for (const file of files) {
      library.upload(file, tab).catch((error: Error) => showError(`${file.name}: ${error.message}`));
    }
  }

  const switches = room.switches || defaultRoomSwitches;
  const canUpload = mayUpload(person.role, switches.uploads);
  const filters = libraryFilters(person.role);
  const folderLibrary = person.role === "gm" && library.filter === "account" ? "account" : "room";
  const canCreateFolder = person.role === "gm" ? library.filter !== "server" : canUpload && library.filter !== "server";
  const menuHandlers = {
    onAssetMenu: (asset: LibraryViewAsset, event: React.MouseEvent) =>
      setMenu({ kind: "asset", asset, x: event.clientX, y: event.clientY }),
    onFolderMenu: (folder: LibraryFolder, event: React.MouseEvent) =>
      setMenu({ kind: "folder", folder, x: event.clientX, y: event.clientY }),
  };

  const tabButtons = tabs.map((value) => {
    const Icon = tabIcons[value];
    const active = value === tab;
    return (
      <IconButton
        key={value}
        aria-label={dockTabLabels[value]}
        title={dockTabLabels[value]}
        aria-pressed={active}
        onClick={() => {
          setTab(value);
          setCollapsed(false);
        }}
        sx={{
          flexGrow: collapsed ? 0 : 1,
          height: "40px",
          width: collapsed ? "40px" : "auto",
          borderRadius: 0,
          color: active && !collapsed ? "primary" : "text",
          borderBottom: collapsed ? "none" : "2px solid",
          borderColor: active ? "primary" : "transparent",
        }}
      >
        <Icon />
      </IconButton>
    );
  });

  if (collapsed) {
    return (
      // A Box, as Flex's own display would win over hiding it in full screen
      <Box
        as="aside"
        aria-label="Dock"
        sx={{
          display: fullScreen ? "none" : "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "44px",
          minWidth: "44px",
          height: "100%",
          borderLeft: "1px solid",
          borderColor: "muted",
        }}
      >
        <IconButton aria-label="Expand the dock" title="Expand the dock" onClick={() => setCollapsed(false)} sx={{ height: "40px" }}>
          «
        </IconButton>
        {tabButtons}
      </Box>
    );
  }

  return (
    <DragContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      autoScroll={false}
      sensors={sensors}
    >
      <Box
        as="aside"
        aria-label="Dock"
        sx={{
          display: fullScreen ? "none" : "flex",
          flexDirection: "column",
          width: "300px",
          minWidth: "300px",
          height: "100%",
          borderLeft: "1px solid",
          borderColor: "muted",
          overflow: "hidden",
        }}
      >
        <Flex sx={{ borderBottom: "1px solid", borderColor: "muted", flexShrink: 0 }}>
          {tabButtons}
          <IconButton aria-label="Collapse the dock" title="Collapse the dock" onClick={() => setCollapsed(true)} sx={{ height: "40px", width: "32px" }}>
            »
          </IconButton>
        </Flex>
        <Text as="h2" variant="heading" sx={{ fontSize: 2, px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
          {dockTabLabels[tab]}
        </Text>
        {tab === "scenes" ? (
          <Box sx={{ flexGrow: 1, overflowY: "auto", px: 2 }}>
            <SceneList onDone={() => undefined} />
          </Box>
        ) : (
          <>
            <Flex sx={{ px: 2, pb: 1, gap: 1, flexShrink: 0 }}>
              {canUpload && (
                <Button variant="secondary" sx={smallButton} onClick={() => fileInput.current?.click()}>
                  Upload
                </Button>
              )}
              {canCreateFolder && (
                <Button variant="secondary" sx={smallButton} onClick={() => setNewFolder(true)}>
                  New folder
                </Button>
              )}
              <Button
                variant="secondary"
                sx={smallButton}
                onClick={() => library.openExtension({ extension: "manager" })}
              >
                Manager
              </Button>
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={handleUpload} />
            </Flex>
            <Flex sx={{ px: 2, pb: 1, gap: 1, alignItems: "center", flexShrink: 0 }}>
              <Input
                aria-label="Search the dock"
                placeholder="Search"
                value={library.search}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => library.setSearch(event.target.value)}
                sx={{ flexGrow: 1, minWidth: 0, py: "2px", px: 1, fontSize: 1 }}
              />
              <Box sx={{ width: "92px", flexShrink: 0 }}>
                <Select
                  aria-label="Show library"
                  value={library.filter}
                  onChange={(event) => library.setFilter(event.target.value as LibraryFilter)}
                  sx={{ py: "2px", pl: 1, pr: "20px", fontSize: 0, color: "text", option: { color: "text", backgroundColor: "background" } }}
                >
                  {filters.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Box>
              <Button
                variant="secondary"
                title={library.order === "name" ? "Showing A to Z; show newest first" : "Showing newest first; show A to Z"}
                aria-label={library.order === "name" ? "Order: A to Z" : "Order: newest first"}
                onClick={() => library.setOrder(library.order === "name" ? "newest" : "name")}
                sx={{ px: 1, py: "2px", fontSize: 0, width: "40px", flexShrink: 0 }}
              >
                {library.order === "name" ? "A-Z" : "New"}
              </Button>
              <Button
                variant="secondary"
                title="Close every folder"
                aria-label="Close every folder"
                onClick={() => setCollapseKey((key) => key + 1)}
                sx={{ px: 1, py: "2px", fontSize: 0, width: "26px", flexShrink: 0 }}
              >
                ⇤
              </Button>
              {person.role === "gm" && (
                <IconButton
                  aria-label="Pop out the server set"
                  title="Pop out the server set"
                  onClick={() => setServerWindow(true)}
                  sx={{ width: "26px", height: "26px", flexShrink: 0, color: sectionColours.server.accent }}
                >
                  <DisplayPopoutIcon />
                </IconButton>
              )}
            </Flex>
            <Box sx={{ flexGrow: 1, overflowY: "auto" }} onTouchStart={preventSelect} onTouchEnd={resumeSelect}>
              {library.loading ? (
                <Text as="p" variant="caption" px={2}>
                  Loading the library…
                </Text>
              ) : (
                <DockTree
                  type={tab}
                  person={person}
                  roomId={roomId}
                  accountId={accountId}
                  collapseKey={collapseKey}
                  onPlace={handlePlace}
                  {...menuHandlers}
                />
              )}
            </Box>
          </>
        )}
        <DockQuota bars={bars} />
      </Box>
      {serverWindow && (
        <FloatingWindow
          title="Server set"
          colour={sectionColours.server.heading}
          initial={{ x: Math.max(window.innerWidth - 660, 16), y: 80 }}
          onClose={() => setServerWindow(false)}
        >
          <Box px={2} py={1}>
            <Text as="p" variant="caption" m={0}>
              Read-only. {tab === "scenes" ? "Choose an asset tab to browse it." : `${dockTabLabels[tab]} assets.`}
            </Text>
          </Box>
          {tab !== "scenes" && (
            <DockTree
              type={tab}
              person={person}
              roomId={roomId}
              accountId={accountId}
              filter="server"
              collapseKey={collapseKey}
              onPlace={handlePlace}
              onAssetMenu={menuHandlers.onAssetMenu}
            />
          )}
        </FloatingWindow>
      )}
      {menu && (
        <DockMenu
          target={menu}
          person={person}
          onPlace={handlePlace}
          onError={showError}
          onClose={() => setMenu(null)}
        />
      )}
      <DockNameModal
        isOpen={newFolder}
        label={folderLibrary === "account" ? "New folder in my library" : "New folder in this room"}
        name=""
        submitText="Create"
        onRequestClose={() => setNewFolder(false)}
        onSubmit={(name) => {
          setNewFolder(false);
          library.command({ action: "folder-create", library: folderLibrary, name })
            .catch((error: Error) => showError(error.message));
        }}
      />
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragAsset && (
            <Box sx={{ width: "220px", bg: "background", border: "1px solid", borderColor: "border", borderRadius: "4px", opacity: 0.9 }}>
              <DockRow asset={dragAsset} />
            </Box>
          )}
        </DragOverlay>,
        document.body
      )}
    </DragContext>
  );
}

export default Dock;
