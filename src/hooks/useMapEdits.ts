import { useState } from "react";

import { isEmpty } from "../helpers/shared";
import { getGridDefaultInset } from "../helpers/grid";

import { UpdateMapEventHanlder } from "../contexts/MapDataContext";
import { Map } from "../types/Map";

/**
 * Changes to a map of the browser library, held until they are saved to its
 * record. Saving changes no scene.
 */
function useMapEdits(map: Map, onUpdateMap: UpdateMapEventHanlder) {
  const [changes, setChanges] = useState<Partial<Map>>({});

  function change(change: Partial<Map>) {
    setChanges((prevChanges) => ({
      ...prevChanges,
      ...change,
    }));
  }

  function discard() {
    setChanges({});
  }

  /** Saves the changes and returns the map as it is now stored */
  async function save(): Promise<Map> {
    if (isEmpty(changes)) {
      return map;
    }
    // Ensure grid values are positive
    let verifiedChanges: Partial<Map> = { ...changes };
    if (verifiedChanges.grid) {
      verifiedChanges.grid.size.x = Math.max(1, verifiedChanges.grid.size.x || 1);
      verifiedChanges.grid.size.y = Math.max(1, verifiedChanges.grid.size.y || 1);
    }
    // Ensure inset isn't flipped
    if (verifiedChanges.grid) {
      const inset = verifiedChanges.grid.inset;
      if (
        inset.topLeft.x >= inset.bottomRight.x ||
        inset.topLeft.y >= inset.bottomRight.y
      ) {
        verifiedChanges.grid.inset = getGridDefaultInset(
          { size: verifiedChanges.grid.size, type: verifiedChanges.grid.type },
          map.width,
          map.height
        );
      }
    }
    await onUpdateMap(map.id, verifiedChanges);
    setChanges({});
    return { ...map, ...verifiedChanges } as Map;
  }

  return { edited: { ...map, ...changes } as Map, change, discard, save };
}

export default useMapEdits;
