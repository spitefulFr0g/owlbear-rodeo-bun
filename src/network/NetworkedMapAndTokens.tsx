import { useRole, useRoom } from "../contexts/RoomContext";
import Session from "./Session";
import useSceneMap from "../hooks/useSceneMap";
import WelcomeScreen from "../components/WelcomeScreen";
import Map from "../components/map/Map";
import TokenBar from "../components/token/TokenBar";
import GlobalImageDrop from "../components/image/GlobalImageDrop";
import { Map as MapType } from "../types/Map";

function NetworkedMapAndTokens({ session }: { session: Session }) {
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
  if (role !== "gm" && room.session === false) return <WelcomeScreen />;
  return (
    <GlobalImageDrop onMapChange={handleMapChange}>
      <Map session={session} />
      <TokenBar />
    </GlobalImageDrop>
  );
}
export default NetworkedMapAndTokens;
