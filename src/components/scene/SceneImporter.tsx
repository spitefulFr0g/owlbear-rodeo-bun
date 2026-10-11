import { useState } from "react";

import SelectMapModal from "../../modals/SelectMapModal";
import ImportSceneModal from "../../modals/ImportSceneModal";

import { useMapData } from "../../contexts/MapDataContext";
import { SceneAnswer } from "../../scene/SceneContext";

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
          map={map}
          onPickAnother={() => setMapId(undefined)}
          onCancel={onCancel}
          onCreated={onCreated}
          refusal={refusal}
        />
      )}
    </>
  );
}

export default SceneImporter;
