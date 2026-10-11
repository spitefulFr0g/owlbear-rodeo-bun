import { useEffect, useRef } from "react";

import { useMapStage } from "../contexts/MapStageContext";
import {
  useStageHeight,
  useStageWidth,
} from "../contexts/MapInteractionContext";

import {
  DisplayView,
  isSameMapRect,
} from "../helpers/displayView";

import Session from "./Session";
import { worldNodeId } from "../scene/worldPosition";

// Send view updates every 50ms (20fps), as the pointer does
const sendTickRate = 50;
// The server drops views that arrive before it knows who we are or which scene
// is shown, so repeat a view that stays still
const resendInterval = 2000;

type NetworkedDisplayViewProps = {
  session: Session;
  sceneId: string;
};

/**
 * Tells the server which part of the scene this window shows, for cast displays
 * to follow. Rendered only for a GM connection.
 */
function NetworkedDisplayView({ session, sceneId }: NetworkedDisplayViewProps) {
  const mapStageRef = useMapStage();
  const stageWidth = useStageWidth();
  const stageHeight = useStageHeight();

  const frameRef = useRef({ stageWidth, stageHeight });
  useEffect(() => {
    frameRef.current = { stageWidth, stageHeight };
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
      const world = stage?.findOne(`#${worldNodeId}`);
      if (!stage || !world || !session.socket?.connected) {
        return;
      }
      const inverse = world.getAbsoluteTransform().copy().invert();
      const topLeft = inverse.point({ x: 0, y: 0 });
      const bottomRight = inverse.point({ x: frameRef.current.stageWidth, y: frameRef.current.stageHeight });
      const rect = { ...topLeft, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
      if (!Object.values(rect).every(Number.isFinite)) {
        return;
      }
      const sent = sentViewRef.current;
      if (
        sent &&
        sent.sceneId === sceneId &&
        isSameMapRect(sent, rect) &&
        time - sentTimeRef.current < resendInterval
      ) {
        return;
      }
      const view = { sceneId, ...rect };
      session.socket.emit("display_view", view);
      sentViewRef.current = view;
      sentTimeRef.current = time;
    }

    return () => {
      cancelAnimationFrame(request);
    };
  }, [session, sceneId, mapStageRef]);

  return null;
}

export default NetworkedDisplayView;
