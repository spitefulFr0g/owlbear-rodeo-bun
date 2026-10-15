import { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import { Box, Button, Input, Label, Text } from "theme-ui";
import Modal from "../Modal";
import ImportSceneModal from "../../modals/ImportSceneModal";
import { useLibrary } from "../../contexts/LibraryContext";
import { SceneAnswer, useScene } from "../../scene/SceneContext";
import { sceneFromMap } from "../../scene/mapItem";
import { sceneLibraryMap } from "../../helpers/libraryScene";
import { BundledLibraryAsset } from "../../helpers/serverSet";
import { LibraryAsset } from "../../sceneRules/library";
import { Map } from "../../types/Map";

type SceneImporterProps = { onCancel: () => void; onCreated: () => void; refusal: (answer: SceneAnswer) => string };

/** New scene is the only entry to alignment; all images already have room placement authority. */
function SceneImporter({ onCancel, onCreated, refusal }: SceneImporterProps) {
  const library = useLibrary();
  const { createScene } = useScene();
  const [selected, setSelected] = useState<LibraryAsset | BundledLibraryAsset>();
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Resolve authoritative edits/removal while the importer is open, including a just-uploaded entry.
  const asset = selected && ("key" in selected ? selected : library.assets.find(asset => asset.id === selected.id) || selected);
  const map = asset && sceneLibraryMap(asset);
  async function upload(file: File) {
    setBusy(true); setError(undefined);
    try { setSelected((await library.upload(file, "map")).asset); }
    catch (error) { setError(error instanceof Error ? error.message : "Upload failed"); }
    setBusy(false);
  }
  async function saveMap(_id: string, changes: Partial<Map>) {
    if (!asset || "key" in asset || !changes.grid) return;
    const current = library.assets.find(value => value.id === asset.id);
    if (!current) throw new Error("That map is no longer in your libraries.");
    await library.command({ action: "edit", id: current.id, changes: { defaults: { ...current.defaults, grid: changes.grid } } });
  }
  async function create(saved: Map | undefined, sceneName: string, fogFill: boolean) {
    if (!saved || !asset) return "Choose a map first.";
    if (!("key" in asset) && !library.assets.some(value => value.id === asset.id)) return "That map is no longer in your libraries.";
    const created = sceneFromMap(saved, sceneName, uuid());
    const answer = await createScene(created.name, { fogFill, grid: created.grid, map: created.map });
    if (!answer.ok) return refusal(answer);
    onCreated();
  }
  async function empty() {
    setBusy(true); setError(undefined);
    const answer = await createScene(name.trim());
    setBusy(false);
    if (answer.ok) onCreated(); else setError(refusal(answer));
  }
  return map ? <ImportSceneModal key={map.id} isOpen label="New scene from a map" map={map}
    confirmText="Create scene" pickText="Choose another map" onPickAnother={() => setSelected(undefined)}
    onCancel={onCancel} onSaveMap={saveMap} onConfirm={create} /> :
    <Modal isOpen contentLabel="New scene" allowClose={!busy} onRequestClose={busy ? undefined : onCancel}>
      <><Label htmlFor="emptySceneName">New empty scene</Label>
      <Input id="emptySceneName" value={name} maxLength={100} onChange={event => setName(event.target.value)} />
      <Button my={2} disabled={busy || !name.trim()} onClick={empty}>Create empty</Button>
      <Label htmlFor="newSceneUpload">Upload a map</Label>
      <Input id="newSceneUpload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy}
        onChange={event => { const file = event.target.files?.[0]; if (file) upload(file); event.target.value = ""; }} />
      <Label htmlFor="newSceneSearch" mt={3}>Choose a map from your libraries</Label>
      <Input id="newSceneSearch" placeholder="Search maps" value={search} onChange={event => setSearch(event.target.value)} />
      <Box sx={{ maxHeight: "45vh", overflowY: "auto" }}>
        {([...library.assets, ...library.serverSet]).filter(asset => asset.type === "map" && asset.name.toLowerCase().includes(search.toLowerCase())).map(asset =>
          <Button key={asset.id} variant="secondary" disabled={busy} sx={{ display: "block", width: "100%", textAlign: "left" }} my={1} onClick={() => setSelected(asset)}>
            {asset.name} · {"key" in asset ? "Server set" : asset.library.kind === "account" ? "My library" : asset.uploader ? "From players" : "This room"}
          </Button>)}
      </Box>
      {error && <Text as="p" role="alert">{error}</Text>}
    </></Modal>;
}

/** Mounted independently of dock visibility, so room-level requests always have a consumer. */
export function NewSceneExtension() {
  const { extensionRequest, closeExtension } = useLibrary();
  const { person } = useScene();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (extensionRequest?.extension === "new-scene") { setOpen(true); closeExtension(); }
  }, [extensionRequest, closeExtension]);
  return open && person.role === "gm" ? <SceneImporter onCancel={() => setOpen(false)} onCreated={() => setOpen(false)}
    refusal={answer => `Unable to create scene: ${answer.error || "room refused"}`} /> : null;
}
export default SceneImporter;
