import { useEffect, useState } from "react";
import { useColorMode } from "theme-ui";
import useImage from "use-image";

import SceneGrid from "../components/scene/SceneGrid";

import { useDataURL } from "../contexts/AssetsContext";

import { getImageLightness } from "../helpers/image";

import { mapSources as defaultMapSources } from "../maps";

import useSceneMap from "./useSceneMap";

/**
 * The scene's grid, drawn dark over a light map or a light page and
 * light over a dark one
 */
function useSceneGrid() {
  const { placed } = useSceneMap();
  const map = placed ? placed.image : null;
  const [colorMode] = useColorMode();

  const mapURL = useDataURL(
    map,
    defaultMapSources,
    undefined,
    map?.type === "file"
  );
  const [mapImage, mapLoadingStatus] = useImage(mapURL || "");

  const [isMapLight, setIsMapLight] = useState(true);
  // When the map changes find the average lightness of its pixels
  useEffect(() => {
    if (mapLoadingStatus === "loaded" && mapImage) {
      setIsMapLight(getImageLightness(mapImage));
    }
  }, [mapImage, mapLoadingStatus]);

  const isLight = map ? isMapLight : colorMode === "light";

  return <SceneGrid stroke={isLight ? "black" : "white"} />;
}

export default useSceneGrid;
