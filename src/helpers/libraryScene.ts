import { LibraryAsset } from "../sceneRules/library";
import { Map } from "../types/Map";
import { editorMap } from "./assetManager";
import { BundledLibraryAsset } from "./serverSet";

/** A scene keeps the original and all quality copies, independently of the preview copy. */
export function sceneLibraryMap(asset: LibraryAsset | BundledLibraryAsset): Map {
  const map = editorMap(asset, asset.defaults.grid);
  if (map.type !== "file" || !("files" in asset)) return map;
  const resolutions: Record<string, string> = {};
  for (const role of ["low", "medium", "high", "ultra"] as const) {
    const file = asset.files[role];
    if (file) resolutions[role] = file.id;
  }
  return { ...map, file: asset.files.original.id, resolutions };
}
