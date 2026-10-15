import { useRole, useRoom } from "../contexts/RoomContext";
import { useScene } from "../scene/SceneContext";
import DisplayMap from "../components/display/DisplayMap";
import { defaultDisplayView } from "../helpers/defaultDisplayView";
import Session from "./Session";
import useSceneMap from "../hooks/useSceneMap";
import WelcomeScreen from "../components/WelcomeScreen";
import Map from "../components/map/Map";
import Dock from "../components/dock/Dock";
import AssetManager from "../components/assetManager/AssetManager";
import GlobalImageDrop from "../components/image/GlobalImageDrop";
import { Map as MapType } from "../types/Map";

function NetworkedMapAndTokens({ session }: { session: Session }) {
  const { scene } = useScene();
  const role = useRole();
  const room = useRoom();
  const sceneMap = useSceneMap();
  // An image dropped as a map goes on the scene being viewed
  async function handleMapChange(map: MapType) {
    try {
      await sceneMap.pick(map);
    } catch (error) {
      console.error(error);
    }
  }
  if (role !== "gm" && room.session === false) {
    return scene
      ? <DisplayMap key={scene.id} view={defaultDisplayView(scene)} interactive />
      : <WelcomeScreen />;
  }
  return (
    <GlobalImageDrop onMapChange={handleMapChange}>
      <Map session={session} />
      <Dock />
      <AssetManager />
    </GlobalImageDrop>
  );
}
export default NetworkedMapAndTokens;
