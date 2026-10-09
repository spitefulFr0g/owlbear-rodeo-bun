import { useEffect, useRef } from "react";

import { useMapStage } from "../contexts/MapStageContext";
import {
  useMapHeight,
  useMapWidth,
  useStageHeight,
  useStageWidth,
} from "../contexts/MapInteractionContext";

import {
  DisplayView,
  getVisibleMapRect,
  isSameMapRect,
} from "../helpers/displayView";

import Session from "./Session";

// Send view updates every 50ms (20fps), as the pointer does
const sendTickRate = 50;
// The server drops views that arrive before it knows who we are or which map
// is shown, so repeat a view that stays still
const resendInterval = 2000;

type NetworkedDisplayViewProps = {
  session: Session;
  mapId: string;
};

/**
 * Tells the server which part of the map this window shows, for cast displays
 * to follow. Rendered only for the player being followed.
 */
function NetworkedDisplayView({ session, mapId }: NetworkedDisplayViewProps) {
  const mapStageRef = useMapStage();
  const stageWidth = useStageWidth();
  const stageHeight = useStageHeight();
  const mapWidth = useMapWidth();
  const mapHeight = useMapHeight();

  const frameRef = useRef({ stageWidth, stageHeight, mapWidth, mapHeight });
  useEffect(() => {
    frameRef.current = { stageWidth, stageHeight, mapWidth, mapHeight };
  });

  const sentViewRef = useRef<DisplayView | null>(null);
  const sentTimeRef = useRef(0);

  // The server forgets the view when we rejoin, so send it again
  useEffect(() => {
    function handleStatus() {
      sentViewRef.current = null;
    }
    session.on("status", handleStatus);
    return () => {
      session.off("status", handleStatus);
    };
  }, [session]);

  // Panning moves the stage without a render, so look at it every sendTickRate
  // We use requestAnimationFrame as setInterval was being blocked during
  // re-renders on Chrome with Windows
  useEffect(() => {
    let prevTime = performance.now();
    let request = requestAnimationFrame(update);
    let counter = 0;
    function update(time: number) {
      request = requestAnimationFrame(update);
      counter += time - prevTime;
      prevTime = time;
      if (counter < sendTickRate) {
        return;
      }
      counter = 0;

      const stage = mapStageRef.current;
      const layer = stage?.findOne("#mapImage")?.getLayer();
      if (!stage || !layer || !session.socket?.connected) {
        return;
      }
      const rect = getVisibleMapRect(
        { x: stage.x(), y: stage.y(), scale: stage.scaleX() },
        { ...frameRef.current, layerX: layer.x(), layerY: layer.y() }
      );
      if (!Object.values(rect).every(Number.isFinite)) {
        return;
      }
      const sent = sentViewRef.current;
      if (
        sent &&
        sent.mapId === mapId &&
        isSameMapRect(sent, rect) &&
        time - sentTimeRef.current < resendInterval
      ) {
        return;
      }
      const view = { mapId, ...rect };
      session.socket.emit("display_view", view);
      sentViewRef.current = view;
      sentTimeRef.current = time;
    }

    return () => {
      cancelAnimationFrame(request);
    };
  }, [session, mapId, mapStageRef]);

  return null;
}

export default NetworkedDisplayView;
