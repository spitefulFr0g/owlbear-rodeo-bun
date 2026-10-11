import { useMapLoading } from "../contexts/MapLoadingContext";
import { useRole, useRoom } from "../contexts/RoomContext";
import Session from "./Session";
import useSceneMap from "../hooks/useSceneMap";
import { getRoleControls } from "../helpers/roomControls";
import WelcomeScreen from "../components/WelcomeScreen";
import Map from "../components/map/Map";
import TokenBar from "../components/token/TokenBar";
import GlobalImageDrop from "../components/image/GlobalImageDrop";
import { Map as MapType } from "../types/Map";

function NetworkedMapAndTokens({ session }: { session: Session }) {
  const role = useRole();
  const room = useRoom();
  const { isLoading } = useMapLoading();
  const sceneMap = useSceneMap();
  async function handleMapChange(map: MapType | null) {
    try {
      await sceneMap.pick(map);
    } catch (error) {
      console.error(error);
    }
  }
  if (role !== "gm" && room.session === false) return <WelcomeScreen />;
  const canChangeMap = !isLoading && !sceneMap.readOnly && getRoleControls(role).map;
  return (
    <GlobalImageDrop onMapChange={handleMapChange}>
      <Map onMapChange={handleMapChange} allowMapChange={canChangeMap} session={session} />
      <TokenBar />
    </GlobalImageDrop>
  );
}
export default NetworkedMapAndTokens;
