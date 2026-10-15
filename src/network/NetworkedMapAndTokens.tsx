import { useRole, useRoom } from "../contexts/RoomContext";
import { useScene } from "../scene/SceneContext";
import DisplayMap from "../components/display/DisplayMap";
import { defaultDisplayView } from "../helpers/defaultDisplayView";
import Session from "./Session";
import WelcomeScreen from "../components/WelcomeScreen";
import Map from "../components/map/Map";
import Dock from "../components/dock/Dock";
import AssetManager from "../components/assetManager/AssetManager";
import { NewSceneExtension } from "../components/scene/SceneImporter";
import GlobalImageDrop from "../components/image/GlobalImageDrop";

function NetworkedMapAndTokens({ session }: { session: Session }) {
  const { scene } = useScene();
  const role = useRole();
  const room = useRoom();
  if (role !== "gm" && room.session === false) {
    return scene
      ? <DisplayMap key={scene.id} view={defaultDisplayView(scene)} interactive />
      : <WelcomeScreen />;
  }
  return (
    <GlobalImageDrop>
      <Map session={session} />
      <Dock />
      <AssetManager />
      <NewSceneExtension />
    </GlobalImageDrop>
  );
}
export default NetworkedMapAndTokens;
