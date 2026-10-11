import { useState } from "react";
import { v4 as uuid } from "uuid";

import SelectMapModal from "../../modals/SelectMapModal";
import ImportSceneModal from "../../modals/ImportSceneModal";

import { useMapData } from "../../contexts/MapDataContext";
import { SceneAnswer, useScene } from "../../scene/SceneContext";
import { sceneFromMap } from "../../scene/mapItem";
import { imageFiles } from "../../scene/shown";

import { Map } from "../../types/Map";

type SceneImporterProps = {
  onCancel: () => void;
  onCreated: () => void;
  refusal: (answer: SceneAnswer) => string;
};

/**
 * Makes a scene from a map of the browser library: the map picker, then the
 * importer. The only way to the map picker.
 */
function SceneImporter({ onCancel, onCreated, refusal }: SceneImporterProps) {
  const { mapsById } = useMapData();
  const [mapId, setMapId] = useState<string>();
  // Gone when the map is removed from the library meanwhile
  const map = mapId ? mapsById[mapId] : undefined;
  const { createScene, share } = useScene();

  async function handleCreate(saved: Map | undefined, name: string) {
    if (!saved) return "That map is no longer in the browser library.";
    const create = sceneFromMap(saved, name, uuid());
    try {
      // The server must hold an image's bytes before an item names them
      await share(imageFiles(create.map));
    } catch (error) {
      console.error(error);
      return "The map's images could not be sent to the room.";
    }
    const answer = await createScene(create.name, {
      grid: create.grid,
      map: create.map,
    });
    if (!answer.ok) return refusal(answer);
    onCreated();
  }

  return (
    <>
      <SelectMapModal
        isOpen={!map}
        onDone={onCancel}
        onMapSelect={(map) => setMapId(map.id)}
      />
      {map && (
        <ImportSceneModal
          isOpen
          label="New scene from a map"
          map={map}
          confirmText="Create scene"
          pickText="Choose another map"
          onPickAnother={() => setMapId(undefined)}
          onCancel={onCancel}
          onConfirm={handleCreate}
        />
      )}
    </>
  );
}

export default SceneImporter;
