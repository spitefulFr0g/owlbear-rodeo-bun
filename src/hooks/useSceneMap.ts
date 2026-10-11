import { useRef } from "react";
import { v4 as uuid } from "uuid";

import { useScene } from "../scene/SceneContext";
import { imageFiles } from "../scene/shown";
import {
  fitMap,
  mapItem,
  mapSceneGrid,
  mapTopLeft,
  pickedMap,
} from "../scene/mapItem";
import { Change } from "../sceneRules";
import { Map } from "../types/Map";

/** Map library actions use the scene store, never the legacy map message. */
export default function useSceneMap() {
  const store = useScene();
  const latest = useRef(store);
  latest.current = store;
  return {
    placed: pickedMap(store.scene),
    readOnly: store.readOnly,
    async pick(map: Map | null) {
      const initial = latest.current;
      if (initial.readOnly || initial.person.role !== "gm" || !initial.scene) return;
      if (map) {
        const item = mapItem(map, mapSceneGrid(map, initial.scene.grid), uuid());
        await initial.share(imageFiles(item));
      }
      // Uploads may take time; use the scene as it is now, and never write to a different scene.
      const { scene, person, readOnly, act, setSettings } = latest.current;
      if (!scene || scene.id !== initial.scene.id || readOnly || person.role !== "gm") return;
      const previous = pickedMap(scene);
      const changes: Change[] = previous ? [{ type: "delete", id: previous.id }] : [];
      if (map) {
        const grid = mapSceneGrid(map, scene.grid);
        changes.push({
          type: "add",
          item: mapItem(map, grid, uuid(), previous && mapTopLeft(previous)),
        });
        if (act(changes, false)) setSettings({ grid });
      } else {
        act(changes, false);
      }
    },
    edit(map: Map) {
      const { scene, person, readOnly, act, setSettings } = latest.current;
      const previous = pickedMap(scene);
      if (!scene || readOnly || person.role !== "gm" || previous?.metadata.pickerMapId !== map.id) return;
      const grid = mapSceneGrid(map, scene.grid);
      if (act([{
        type: "update",
        id: previous.id,
        fields: {
          ...fitMap(map, grid, mapTopLeft(previous)),
          metadata: { mapQuality: map.type === "file" ? map.quality : "original" },
        },
      }])) setSettings({ grid });
    },
  };
}
