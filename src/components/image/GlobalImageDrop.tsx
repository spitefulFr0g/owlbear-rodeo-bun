import React, { useRef, useState } from "react";
import { Button, Flex, Label, Select, Text } from "theme-ui";
import { useToasts } from "react-toast-notifications";
import Modal from "../Modal";
import LoadingOverlay from "../LoadingOverlay";
import { useLibrary } from "../../contexts/LibraryContext";
import { useRoom } from "../../contexts/RoomContext";
import { useScene } from "../../scene/SceneContext";
import { defaultRoomSwitches } from "../../helpers/roomControls";
import { dockTabLabels } from "../../helpers/dock";
import { AssetType, assetTypes, LibraryAsset, mayUpload } from "../../sceneRules/library";
import useImageDrop, { ImageDropEvent } from "../../hooks/useImageDrop";
import { useMapStage } from "../../contexts/MapStageContext";
import { clientPositionToWorld } from "../../scene/worldPosition";
import useLibraryPlacement from "../../hooks/useLibraryPlacement";

function GlobalImageDrop({ children }: { children?: React.ReactNode }) {
  const { addToast } = useToasts();
  const library = useLibrary();
  const room = useRoom();
  const store = useScene();
  const place = useLibraryPlacement();
  const stage = useMapStage();
  const worldDrop = useRef<{ x: number; y: number }>();
  const latest = useRef({ store, place });
  latest.current = { store, place };
  const [batch, setBatch] = useState<ImageDropEvent>();
  const [type, setType] = useState<AssetType>("character");
  const [busy, setBusy] = useState(false);
  const allowed = mayUpload(store.person.role, (room.switches || defaultRoomSwitches).uploads);
  function handleDrop(event: ImageDropEvent) {
    if (store.person.role === "display" || !event.files.length) return;
    if (!allowed) { addToast("Image uploads are unavailable in this room."); return; }
    if (busy || batch) { addToast("Finish the current upload first."); return; }
    worldDrop.current = stage.current ? clientPositionToWorld(stage.current, event.dropPosition) || undefined : undefined;
    setType("character");
    setBatch(event);
  }
  async function upload() {
    if (!batch) return;
    setBusy(true);
    const sceneId = store.scene?.id;
    const assets: LibraryAsset[] = [];
    for (const file of batch.files) {
      try { assets.push((await library.upload(file, type)).asset); }
      catch (error) { addToast(`${file.name}: ${error instanceof Error ? error.message : "Upload failed"}`); }
    }
    const current = latest.current;
    if (assets.length && (current.store.scene?.id !== sceneId || !current.place(assets, batch.dropPosition, worldDrop.current))) {
      addToast("The images were uploaded, but could not be placed. Place them from the dock.");
    }
    setBusy(false);
    setBatch(undefined);
  }
  const { dragging, containerListeners, overlayListeners } = useImageDrop(handleDrop);
  return <Flex sx={{ height: "100%", flexGrow: 1 }} {...(store.person.role === "display" ? {} : containerListeners)}>
    {children}
    {dragging && <Flex {...overlayListeners} sx={{ position: "absolute", inset: 0, zIndex: 100, bg: "overlay", justifyContent: "center", alignItems: "center" }}>
      <Text>{allowed ? "Drop images to upload and place" : "Image uploads are unavailable in this room"}</Text>
    </Flex>}
    <Modal isOpen={!!batch} contentLabel="Upload dropped images" onRequestClose={busy ? undefined : () => setBatch(undefined)} allowClose={!busy}>
      <><Label htmlFor="dropAssetType">Asset type for {batch?.files.length} images</Label>
      <Select id="dropAssetType" value={type} disabled={busy} onChange={event => setType(event.target.value as AssetType)}>
        {assetTypes.filter(value => value !== "map" || store.person.role === "gm").map(value => <option key={value} value={value}>{dockTabLabels[value]}</option>)}
      </Select>
      <Button mt={3} disabled={busy || !allowed} onClick={upload}>Upload and place</Button>
      {busy && <LoadingOverlay bg="overlay" />}
    </></Modal>
  </Flex>;
}
export default GlobalImageDrop;
