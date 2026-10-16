import { useState } from "react";

import { isEmpty } from "../helpers/shared";
import { getGridDefaultInset } from "../helpers/grid";

import { Map } from "../types/Map";

/**
 * Changes to a map in the scene importer, held until its alignment is saved.
 * The changes belong to the map they were made to, and are dropped when
 * another map, or none, takes its place.
 */
function useMapEdits<M extends Map | undefined>(
  map: M,
  onUpdateMap: (id: string, update: Partial<Map>) => Promise<void>
) {
  const mapId = map?.id;
  const [held, setHeld] = useState<{ mapId?: string; changes: Partial<Map> }>({
    mapId,
    changes: {},
  });
  const changes = held.mapId === mapId ? held.changes : {};

  function change(change: Partial<Map>) {
    setHeld((held) => ({
      mapId,
      changes: { ...(held.mapId === mapId ? held.changes : {}), ...change },
    }));
  }

  function discard() {
    setHeld({ mapId, changes: {} });
  }

  /** Saves the changes and returns the map as it is now stored */
  async function save(): Promise<M> {
    if (!map || isEmpty(changes)) {
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
    setHeld({ mapId, changes: {} });
    return { ...map, ...verifiedChanges } as M;
  }

  return {
    edited: (map && { ...map, ...changes }) as M,
    change,
    discard,
    save,
  };
}

export default useMapEdits;
