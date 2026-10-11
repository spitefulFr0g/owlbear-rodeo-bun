import { useRef, useState } from "react";
import { v4 as uuid } from "uuid";

import SelectMapModal from "../../modals/SelectMapModal";
import ImportSceneModal from "../../modals/ImportSceneModal";

import { useMapData } from "../../contexts/MapDataContext";
import { SceneAnswer, useScene } from "../../scene/SceneContext";
import {
  mapItem,
  pickedMap,
  sameAlignment,
  sceneMapEdit,
} from "../../scene/mapItem";
import { imageFiles } from "../../scene/shown";
import { ListedScene } from "../../helpers/sceneList";

import { Map } from "../../types/Map";

const notHere = "This scene is no longer the one on the canvas. Open it and try again.";

type SceneEditorProps = {
  /** The scene this GM connection is viewing */
  scene: ListedScene;
  onCancel: () => void;
  onSaved: () => void;
  refusal: (answer: SceneAnswer) => string;
};

/**
 * Edits the scene being viewed in the importer: its name and its map, which
 * is realigned, replaced by another map of the browser library or removed.
 * Nothing changes until the GM saves.
 */
function SceneEditor({ scene: listed, onCancel, onSaved, refusal }: SceneEditorProps) {
  const { mapsById } = useMapData();
  const store = useScene();
  const latest = useRef(store);
  latest.current = store;

  const placed = pickedMap(store.scene);
  // The map the GM chose for the scene, null for none. Undefined leaves the scene's own
  const [chosenMapId, setChosenMapId] = useState<string | null>();
  const [isPicking, setIsPicking] = useState(false);

  const mapId =
    chosenMapId === undefined
      ? (placed?.metadata.pickerMapId as string | undefined)
      : chosenMapId;
  // None when the scene's map was added from another browser, or removed from this library
  const map = mapId ? mapsById[mapId] : undefined;
  const keepsUnknownMap = chosenMapId === undefined && !!placed && !map;

  async function handleSave(saved: Map | undefined, name: string) {
    const opened = latest.current;
    if (!opened.scene || opened.scene.id !== listed.id || opened.readOnly) {
      return notHere;
    }
    const realigned = !!map && !!saved && !sameAlignment(map, saved);
    if (saved && saved.id !== placed?.metadata.pickerMapId) {
      try {
        // The server must hold an image's bytes before an item names them
        await opened.share(imageFiles(mapItem(saved, opened.scene.grid, "")));
      } catch (error) {
        console.error(error);
        return "The map's images could not be sent to the room.";
      }
    }
    if (name !== listed.name) {
      const answer = await opened.renameScene(listed.id, name);
      if (!answer.ok) return refusal(answer);
    }
    // Uploads may take time; use the scene as it is now, and never write to a different scene
    const { scene, readOnly, act, setSettings } = latest.current;
    if (!scene || scene.id !== listed.id || readOnly) return notHere;
    if (!keepsUnknownMap) {
      const edit = sceneMapEdit(scene, saved, realigned, uuid());
      if (edit.changes.length > 0 && !act(edit.changes, false)) {
        return "The room did not take the change to the map. Try again in a moment.";
      }
      if (edit.grid) setSettings({ grid: edit.grid });
    }
    onSaved();
  }

  return (
    <>
      <SelectMapModal
        isOpen={isPicking}
        onDone={() => setIsPicking(false)}
        onMapSelect={(map) => {
          setChosenMapId(map.id);
          setIsPicking(false);
        }}
      />
      <ImportSceneModal
        isOpen={!isPicking}
        label="Edit scene"
        map={map}
        noMapText={
          keepsUnknownMap
            ? "This scene's map is not in this browser's library, so it cannot be realigned here. It can be replaced or removed."
            : placed
            ? "The map will be taken off the scene."
            : "This scene has no map."
        }
        startName={listed.name}
        confirmText="Save"
        pickText={map || keepsUnknownMap ? "Replace map" : "Choose a map"}
        onPickAnother={() => setIsPicking(true)}
        onRemoveMap={
          map || keepsUnknownMap ? () => setChosenMapId(null) : undefined
        }
        onCancel={onCancel}
        onConfirm={handleSave}
      />
    </>
  );
}

export default SceneEditor;
