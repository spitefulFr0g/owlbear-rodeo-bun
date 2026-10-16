import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { Box, Button, Flex, Input, Select, Text } from "theme-ui";
import { useToasts } from "react-toast-notifications";
import { DragOverlay, DragStartEvent, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

import FloatingWindow from "../FloatingWindow";
import Draggable from "../drag/Draggable";
import Droppable from "../drag/Droppable";
import DockMenu, { DockMenuTarget } from "../dock/DockMenu";
import DockNameModal from "../dock/DockNameModal";
import DockQuota from "../dock/DockQuota";
import { Thumbnail } from "../dock/DockRow";
import ConfirmModal from "../../modals/ConfirmModal";
import { AssetTile, FolderTile } from "./AssetTile";
import AssetDetails from "./AssetDetails";
import AssetEditor from "./AssetEditor";

import DragContext, { CustomDragEndEvent } from "../../contexts/DragContext";
import { useLibrary } from "../../contexts/LibraryContext";
import { useRoom } from "../../contexts/RoomContext";
import { useServerStatus } from "../../contexts/ServerStatusContext";
import { useScene } from "../../scene/SceneContext";
import useSetting from "../../hooks/useSetting";
import useLibraryPlacement from "../../hooks/useLibraryPlacement";
import { folderLibrary, locateAsset, managerSections, managerView } from "../../helpers/assetManager";
import { dockTabLabels, libraryFilters, mayFileIn, quotaBars, sectionColours } from "../../helpers/dock";
import { BundledLibraryAsset } from "../../helpers/serverSet";
import { defaultRoomSwitches } from "../../helpers/roomControls";
import {
  AssetType,
  assetTypes,
  LibraryAsset,
  LibraryCommand,
  LibraryFilter,
  LibraryFolder,
  LibrarySectionId,
  LibraryViewAsset,
  mayUpload,
} from "../../sceneRules/library";

const compactSelect = {
  py: "2px",
  pl: 1,
  pr: "20px",
  fontSize: 1,
  color: "text",
  option: { color: "text", backgroundColor: "background" },
};
const footerButton = { px: 2, py: 1, fontSize: 1 };

/**
 * The room's floating Asset Manager: every library a person may use as
 * sources, browsed by folder in tiles or a list, with the selected asset's
 * details and actions beside it. It shares search, filter and selection
 * with the dock.
 */
function AssetManager() {
  const { person } = useScene();
  const room = useRoom();
  const { id: roomId } = useParams<{ id: string }>();
  const { account } = useServerStatus();
  const accountId = person.role === "gm" ? account?.id : undefined;
  const library = useLibrary();
  const { extensionRequest, closeExtension, setSelection, setFilter, setSearch } = library;
  const place = useLibraryPlacement();
  const { addToast } = useToasts();

  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<LibrarySectionId>();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<AssetType | "all">("all");
  const [savedView, saveView] = useSetting<"tiles" | "list" | undefined>("manager.view");
  const list = savedView === "list";
  const [menu, setMenu] = useState<DockMenuTarget | null>(null);
  const [editing, setEditing] = useState<LibraryAsset | null>(null);
  const [deleting, setDeleting] = useState<LibraryAsset | null>(null);
  const [folderDialog, setFolderDialog] = useState<"create" | "rename" | "delete" | null>(null);
  const [dragAsset, setDragAsset] = useState<LibraryViewAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const showError = useCallback((message: string) => addToast(message, { appearance: "error" }), [addToast]);
  function run(value: LibraryCommand) {
    library.command(value).catch((error: Error) => showError(error.message));
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const { assets, folders, serverSet, filter, order, search } = library;
  // Every source unfiltered, to find where an asset lives
  const everything = useMemo(
    () => managerSections({ person, roomId, accountId, assets, folders, serverSet }),
    [person, roomId, accountId, assets, folders, serverSet]
  );
  const sections = useMemo(
    () =>
      managerSections({
        person, roomId, accountId, assets, folders, serverSet, filter, order, search,
        type: typeFilter === "all" ? undefined : typeFilter,
      }),
    [person, roomId, accountId, assets, folders, serverSet, filter, order, search, typeFilter]
  );

  // The dock, or anything else, opens the manager through the library's extension request
  const request = extensionRequest?.extension === "manager" ? extensionRequest : null;
  useEffect(() => {
    if (!request) return;
    closeExtension();
    setOpen(true);
    const asset = request.asset;
    if (!asset) return;
    setSelection([asset.id]);
    // Open on the asset, clearing whatever search or filter would hide it
    const location = locateAsset(everything, asset.id);
    if (!location) return;
    if (!locateAsset(sections, asset.id)) {
      setFilter("all");
      setSearch("");
      setTypeFilter("all");
    }
    setSource(location.section);
    setFolderId(location.folderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!open || person.role === "display") return null;

  const section = sections.find((candidate) => candidate.id === source) || sections[0];
  const colours = section ? sectionColours[section.id] : sectionColours.room;
  const view = managerView(section, folderId);
  const selectedId = library.selection[0];
  const selected: LibraryViewAsset | undefined =
    library.assets.find((asset) => asset.id === selectedId) || library.serverSet.find((asset) => asset.id === selectedId);
  const selectedLocation = selected && locateAsset(everything, selected.id);
  const where = everything.find((candidate) => candidate.id === selectedLocation?.section)?.heading || "";
  const bars = quotaBars(library.usage, library.assets);

  const switches = room.switches || defaultRoomSwitches;
  const canUpload = mayUpload(person.role, switches.uploads);
  const newFolderLibrary = section && folderLibrary(section.id);
  const canCreateFolder = !view.folder && !!newFolderLibrary;
  const mayChangeFolder = (folder: LibraryFolder) => (person.role === "gm" ? folder.owner === null : folder.owner === person.id);

  function handlePlace(asset: LibraryViewAsset) {
    if (!place([asset as LibraryAsset | BundledLibraryAsset])) {
      showError(`${asset.name} could not be placed. Open a scene you may change first.`);
    }
  }

  function chooseSource(id: LibrarySectionId) {
    setSource(id);
    setFolderId(null);
  }

  function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const type: AssetType = typeFilter === "all" ? "character" : typeFilter;
    // Files land in the open folder when it is this person's own room folder
    const into = view.folder && view.folder.library.kind === "room" && mayChangeFolder(view.folder) ? view.folder.id : null;
    for (const file of files) {
      library.upload(file, type, { folderId: into }).catch((error: Error) => showError(`${file.name}: ${error.message}`));
    }
  }

  function handleDragEnd({ active, over }: CustomDragEndEvent) {
    setDragAsset(null);
    const asset: LibraryViewAsset | undefined = active.data.current?.asset;
    if (!asset || !("files" in asset) || !over || typeof over.id !== "string") return;
    if (over.id === "manager:top") {
      if (view.folder && mayFileIn(asset, view.folder) && asset.folderId) {
        run({ action: "edit", id: asset.id, changes: { folderId: null } });
      }
      return;
    }
    const folder = library.folders.find((candidate) => `folder:${candidate.id}` === over.id);
    if (folder && mayFileIn(asset, folder) && asset.folderId !== folder.id) {
      run({ action: "edit", id: asset.id, changes: { folderId: folder.id } });
    }
  }

  const width = Math.min(800, window.innerWidth - 32);
  const height = Math.min(560, window.innerHeight - 32);
  const filters = libraryFilters(person.role);
  const types = assetTypes.filter((type) => type !== "map" || person.role === "gm");
  const caption = (asset: LibraryViewAsset) =>
    "uploaderName" in asset && asset.uploader && asset.uploader !== person.id ? asset.uploaderName : undefined;

  return (
    <FloatingWindow
      title="Asset Manager"
      initial={{ x: Math.max((window.innerWidth - width) / 2 - 150, 16), y: Math.max((window.innerHeight - height) / 2, 16) }}
      width={width}
      height={height}
      onClose={() => setOpen(false)}
    >
      <DragContext
        onDragStart={({ active }: DragStartEvent) => setDragAsset(active.data.current?.asset || null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragAsset(null)}
        autoScroll={false}
        sensors={sensors}
      >
        <Flex sx={{ flexDirection: "column", height: "100%" }}>
          <Flex role="tablist" aria-label="Sources" sx={{ flexShrink: 0, borderBottom: "1px solid", borderColor: "muted" }}>
            {sections.map((candidate) => {
              const active = candidate.id === section?.id;
              const count = candidate.assets.length + candidate.folders.reduce((total, folder) => total + folder.assets.length, 0);
              return (
                <Box
                  key={candidate.id}
                  as="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => chooseSource(candidate.id)}
                  sx={{
                    flexGrow: 1,
                    flexBasis: 0,
                    py: 1,
                    px: 2,
                    border: "none",
                    borderBottom: "3px solid",
                    borderColor: active ? sectionColours[candidate.id].accent : "transparent",
                    bg: active ? sectionColours[candidate.id].heading : "transparent",
                    color: active ? "white" : "text",
                    fontFamily: "heading",
                    fontSize: 1,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {candidate.heading} <Text as="span" sx={{ fontSize: 0, opacity: 0.75 }}>{count}</Text>
                </Box>
              );
            })}
          </Flex>
          <Flex sx={{ flexShrink: 0, alignItems: "center", flexWrap: "wrap", gap: 1, px: 2, py: 1, borderBottom: "1px solid", borderColor: "muted" }}>
            <Flex as="nav" aria-label="Breadcrumb" sx={{ alignItems: "center", flexGrow: 1, minWidth: 0, gap: 1 }}>
              <Droppable id="manager:top" disabled={!view.folder}>
                <Box
                  as="button"
                  onClick={() => setFolderId(null)}
                  title={view.folder ? "Back to the top, or drop an asset here to take it out of its folder" : undefined}
                  sx={{
                    border: "none",
                    bg: "transparent",
                    p: 0,
                    color: colours.accent,
                    fontFamily: "heading",
                    fontSize: 1,
                    textDecoration: view.folder ? "underline" : "none",
                    cursor: view.folder ? "pointer" : "default",
                    whiteSpace: "nowrap",
                  }}
                >
                  {section?.heading || "Nothing to show"}
                </Box>
              </Droppable>
              {view.folder && (
                <>
                  <Text sx={{ fontSize: 1 }}>›</Text>
                  <Text sx={{ fontSize: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {view.folder.name}
                  </Text>
                </>
              )}
            </Flex>
            <Input
              aria-label="Search the libraries"
              placeholder="Search"
              value={library.search}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
              sx={{ width: "140px", flexShrink: 0, py: "2px", px: 1, fontSize: 1 }}
            />
            <Box sx={{ width: "96px", flexShrink: 0 }}>
              <Select
                aria-label="Show library"
                value={library.filter}
                onChange={(event) => setFilter(event.target.value as LibraryFilter)}
                sx={compactSelect}
              >
                {filters.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Box>
            <Box sx={{ width: "104px", flexShrink: 0 }}>
              <Select
                aria-label="Show type"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as AssetType | "all")}
                sx={compactSelect}
              >
                <option value="all">Every type</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {dockTabLabels[type]}
                  </option>
                ))}
              </Select>
            </Box>
            <Button
              variant="secondary"
              title={library.order === "name" ? "Showing A to Z; show newest first" : "Showing newest first; show A to Z"}
              aria-label={library.order === "name" ? "Order: A to Z" : "Order: newest first"}
              onClick={() => library.setOrder(library.order === "name" ? "newest" : "name")}
              sx={{ ...footerButton, px: 1, width: "44px", flexShrink: 0 }}
            >
              {library.order === "name" ? "A-Z" : "New"}
            </Button>
            <Button
              variant="secondary"
              title={list ? "Show tiles" : "Show a list"}
              aria-label={list ? "Show tiles" : "Show a list"}
              onClick={() => saveView(list ? "tiles" : "list")}
              sx={{ ...footerButton, px: 1, width: "48px", flexShrink: 0 }}
            >
              {list ? "Tiles" : "List"}
            </Button>
          </Flex>
          <Flex sx={{ flexGrow: 1, minHeight: 0 }}>
            <Box
              sx={{
                flexGrow: 1,
                minWidth: 0,
                overflowY: "auto",
                p: 2,
                display: list ? "flex" : "grid",
                flexDirection: "column",
                gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
                alignContent: "start",
                gap: 1,
              }}
            >
              {library.loading && (
                <Text as="p" variant="caption" m={0}>
                  Loading the library…
                </Text>
              )}
              {view.folders.map((folder) => (
                <Droppable key={folder.id} id={`folder:${folder.id}`}>
                  <FolderTile
                    folder={folder}
                    list={list}
                    accent={colours.accent}
                    onOpen={() => setFolderId(folder.id)}
                    onContextMenu={
                      mayChangeFolder(folder)
                        ? (event) => setMenu({ kind: "folder", folder, x: event.clientX, y: event.clientY })
                        : undefined
                    }
                  />
                </Droppable>
              ))}
              {view.assets.map((asset) => (
                <Draggable interactiveChild key={asset.id} id={`asset:${asset.id}`} data={{ asset }}>
                  <AssetTile
                    asset={asset}
                    list={list}
                    selected={asset.id === selectedId}
                    accent={colours.accent}
                    caption={caption(asset)}
                    onSelect={() => setSelection([asset.id])}
                    onPlace={() => handlePlace(asset)}
                    onContextMenu={(event) => {
                      setSelection([asset.id]);
                      setMenu({ kind: "asset", asset, x: event.clientX, y: event.clientY });
                    }}
                  />
                </Draggable>
              ))}
              {!library.loading && view.folders.length === 0 && view.assets.length === 0 && (
                <Text as="p" variant="caption" m={0}>
                  {library.search.trim() || typeFilter !== "all" ? "No matches" : view.folder ? "This folder is empty" : "Nothing here"}
                </Text>
              )}
            </Box>
            <Box
              as="aside"
              aria-label="Selected asset"
              sx={{ width: ["150px", "200px", "240px"], flexShrink: 0, overflowY: "auto", borderLeft: "1px solid", borderColor: "muted" }}
            >
              <AssetDetails
                asset={selected}
                where={where}
                person={person}
                folders={library.folders}
                onPlace={handlePlace}
                onEdit={setEditing}
                onDelete={setDeleting}
                onCommand={run}
              />
            </Box>
          </Flex>
          <Box sx={{ flexShrink: 0 }}>
            <DockQuota bars={bars} />
            <Flex sx={{ gap: 1, px: 2, pb: 2, pt: bars.length ? 0 : 2, flexWrap: "wrap" }}>
              {canUpload && (
                <Button variant="secondary" sx={footerButton} onClick={() => fileInput.current?.click()}>
                  Upload
                </Button>
              )}
              {canCreateFolder && (
                <Button variant="secondary" sx={footerButton} onClick={() => setFolderDialog("create")}>
                  New folder
                </Button>
              )}
              {view.folder && mayChangeFolder(view.folder) && (
                <>
                  <Button variant="secondary" sx={footerButton} onClick={() => setFolderDialog("rename")}>
                    Rename folder
                  </Button>
                  <Button variant="secondary" sx={footerButton} onClick={() => setFolderDialog("delete")}>
                    Delete folder
                  </Button>
                </>
              )}
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={handleUpload} />
            </Flex>
          </Box>
        </Flex>
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {dragAsset && (
              <Box sx={{ opacity: 0.85 }}>
                <Thumbnail asset={dragAsset} size={48} />
              </Box>
            )}
          </DragOverlay>,
          document.body
        )}
      </DragContext>
      {menu && (
        <DockMenu
          target={menu}
          person={person}
          onPlace={handlePlace}
          onError={showError}
          onClose={() => setMenu(null)}
          onEdit={setEditing}
        />
      )}
      {editing && <AssetEditor asset={editing} person={person} onClose={() => setEditing(null)} />}
      <ConfirmModal
        isOpen={!!deleting}
        label={`Delete ${deleting?.name || ""}?`}
        description="It leaves the library and its storage is freed. Copies on the map stay."
        confirmText="Delete"
        onRequestClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) run({ action: "delete", id: deleting.id });
          setDeleting(null);
        }}
      />
      <DockNameModal
        isOpen={folderDialog === "create" || folderDialog === "rename"}
        label={
          folderDialog === "rename"
            ? "Folder name"
            : newFolderLibrary === "account"
              ? "New folder in my library"
              : "New folder in this room"
        }
        name={folderDialog === "rename" ? view.folder?.name || "" : ""}
        submitText={folderDialog === "rename" ? "Rename" : "Create"}
        onRequestClose={() => setFolderDialog(null)}
        onSubmit={(name) => {
          setFolderDialog(null);
          if (folderDialog === "rename" && view.folder) run({ action: "folder-edit", id: view.folder.id, name });
          else if (newFolderLibrary) run({ action: "folder-create", library: newFolderLibrary, name });
        }}
      />
      <ConfirmModal
        isOpen={folderDialog === "delete"}
        label={`Delete the folder ${view.folder?.name || ""}?`}
        description="Its assets stay, at the top of the library."
        confirmText="Delete"
        onRequestClose={() => setFolderDialog(null)}
        onConfirm={() => {
          setFolderDialog(null);
          if (view.folder) {
            run({ action: "folder-delete", id: view.folder.id });
            setFolderId(null);
          }
        }}
      />
    </FloatingWindow>
  );
}

export default AssetManager;
