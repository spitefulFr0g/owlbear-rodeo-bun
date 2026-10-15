import { getDefaultMaps } from "../maps";
import { getDefaultTokens } from "../tokens";
import { legacyCategoryToAssetType, ServerSetAsset } from "../sceneRules/library";
import { libraryDefaults, PlaceableAsset } from "./library";

/** Bundled definitions only, independent of browser-library metadata. */
export type BundledLibraryAsset = ServerSetAsset & PlaceableAsset;
export function bundledServerSet(): BundledLibraryAsset[] {
  return [
    ...getDefaultMaps("").maps.map(map => ({ id: `server:map:${map.key}`, key: map.key, name: map.name,
      type: "map" as const, created: map.created, width: map.width, height: map.height,
      outline: { type: "rect" as const, x: 0, y: 0, width: map.width, height: map.height },
      defaults: { ...libraryDefaults(), grid: map.grid }, image: { type: "default" as const, key: map.key } })),
    ...getDefaultTokens("").map(token => ({ id: `server:token:${token.key}`, key: token.key, name: token.name,
      type: legacyCategoryToAssetType(token.defaultCategory), created: token.created, width: token.width, height: token.height,
      outline: token.outline, defaults: { ...libraryDefaults(), defaultSize: token.defaultSize, defaultLabel: token.defaultLabel },
      image: { type: "default" as const, key: token.key } })),
  ];
}
