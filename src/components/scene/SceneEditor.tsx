import { useRef, useState } from "react";
import { Button, Checkbox, Input, Label, Select, Text } from "theme-ui";
import { v4 as uuid } from "uuid";
import { useLibrary } from "../../contexts/LibraryContext";
import { libraryImage, libraryItem } from "../../helpers/library";
import { Change } from "../../sceneRules";
import Modal from "../Modal";
import { SceneAnswer, useScene } from "../../scene/SceneContext";
import { pickedMap } from "../../scene/mapItem";
import { ListedScene } from "../../helpers/sceneList";

/** Scene settings do not enter the map alignment importer. */
function SceneEditor({ scene: listed, onCancel, onSaved, refusal }: {
  scene: ListedScene; onCancel: () => void; onSaved: () => void; refusal: (answer: SceneAnswer) => string;
}) {
  const store = useScene();
  const library = useLibrary();
  const [replacement, setReplacement] = useState("");
  const latest = useRef(store); latest.current = store;
  const [name, setName] = useState(listed.name);
  const [fogFill, setFogFill] = useState(store.scene?.fogFill || false);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function save() {
    setBusy(true); setError(undefined);
    if (!latest.current.scene || latest.current.scene.id !== listed.id || latest.current.readOnly) {
      setError("Open this scene and try again."); setBusy(false); return;
    }
    if (name.trim() !== listed.name) {
      const answer = await latest.current.renameScene(listed.id, name.trim());
      if (!answer.ok) { setError(refusal(answer)); setBusy(false); return; }
    }
    const current = latest.current;
    if (!current.scene || current.scene.id !== listed.id || current.readOnly) {
      setError("Open this scene and try again."); setBusy(false); return;
    }
    const map = pickedMap(current.scene);
    const changes: Change[] = [];
    if ((remove || replacement) && map) changes.push({ type: "delete", id: map.id });
    if (replacement && !remove) {
      const asset = [...library.assets, ...library.serverSet].find(asset => asset.id === replacement);
      if (!asset || asset.type !== "map") { setError("That map is no longer available."); setBusy(false); return; }
      const item = libraryItem("files" in asset ? { ...asset, image: libraryImage(asset) } : asset,
        map?.position || { x: 0, y: 0 }, current.scene.grid, current.person.id, uuid());
      item.metadata.pickerMapId = asset.id;
      changes.push({ type: "add", item });
    }
    if (changes.length && !current.act(changes, false)) {
      setError("The room refused to change the map."); setBusy(false); return;
    }
    if (fogFill !== current.scene.fogFill) current.setSettings({ fogFill });
    onSaved();
  }
  return <Modal isOpen contentLabel="Edit scene" allowClose={!busy} onRequestClose={busy ? undefined : onCancel}>
    <><Label htmlFor="editSceneName">Scene name</Label>
    <Input id="editSceneName" value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} />
    <Label my={2}><Checkbox checked={fogFill} disabled={busy} onChange={event => setFogFill(event.target.checked)} />Fog Fill</Label>
    {pickedMap(store.scene) && <Label my={2}><Checkbox checked={remove} disabled={busy} onChange={event => setRemove(event.target.checked)} />Remove scene map</Label>}
    <Label htmlFor="replaceSceneMap">Replace scene map</Label>
    <Select id="replaceSceneMap" disabled={busy || remove} value={replacement} onChange={event => setReplacement(event.target.value)}>
      <option value="">Keep current map</option>
      {[...library.assets, ...library.serverSet].filter(asset => asset.type === "map").map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
    </Select>
    <Text as="p">Place additional maps from the dock. Use New scene to align a map.</Text>
    {error && <Text as="p" role="alert">{error}</Text>}
    <Button disabled={busy || !name.trim()} onClick={save}>Save</Button>
  </></Modal>;
}
export default SceneEditor;
