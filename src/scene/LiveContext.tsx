import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Session, { SessionStatus } from "../network/Session";

import {
  LiveKind,
  LiveMessage,
  LiveState,
  LiveTransform,
  ReceivedLiveMessage,
  Scene,
} from "../sceneRules";

import {
  afterLive,
  createLiveSender,
  dragTransforms,
  liveMoving,
  LiveMarks,
  liveStatesAt,
  noLiveMarks,
  withoutConnection,
} from "./live";
import { useScene } from "./SceneContext";

type LiveStore = {
  /**
   * Hands this connection's latest state of one kind to the live sender, for
   * the others viewing the scene. Nothing is sent from a cast display, with no
   * scene, or while the connection is being restored.
   */
  send: <K extends LiveKind>(kind: K, state: LiveState[K]) => void;
  /** Ends this connection's mark of one kind */
  end: (kind: LiveKind) => void;
  /**
   * Counts the times every live mark was cleared: a snapshot and a lost
   * connection. A tool holding a mark of its own lets go of it when this changes.
   */
  cleared: number;
  /** The items this connection is moving, resizing or rotating itself */
  held: string[];
  /** Names the items this connection holds, none once it lets go */
  hold: (ids: string[]) => void;
  /** The live marks received for the scene being viewed */
  marks: () => LiveMarks;
  /** Calls back when the marks change, returns the way to stop */
  subscribe: (listener: () => void) => () => void;
};

const LiveContext = React.createContext<LiveStore | undefined>(undefined);

type LiveProviderProps = {
  session: Session;
  children: React.ReactNode;
};

/**
 * Holds the live marks of the scene being viewed and the one sender of this
 * connection's own. Neither is ever part of the scene.
 */
export function LiveProvider({ session, children }: LiveProviderProps) {
  const { scene, person } = useScene();
  const display = person.role === "display";

  // The scene the latest snapshot holds, known here before it is rendered
  const sceneIdRef = useRef<string | null>(scene?.id ?? null);
  useEffect(() => {
    sceneIdRef.current = scene?.id ?? null;
  }, [scene?.id]);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const marksRef = useRef(noLiveMarks);
  const listenersRef = useRef(new Set<() => void>());
  function changeMarks(next: LiveMarks) {
    if (next === marksRef.current) return;
    marksRef.current = next;
    listenersRef.current.forEach((listener) => listener());
  }

  const [cleared, setCleared] = useState(0);

  const [held, setHeld] = useState<string[]>([]);
  const hold = useCallback((ids: string[]) => {
    setHeld((previous) =>
      previous.length === 0 && ids.length === 0 ? previous : ids
    );
  }, []);

  const sender = useMemo(
    () =>
      createLiveSender((message: LiveMessage, reliable: boolean) => {
        const socket = sessionRef.current.socket;
        if (!socket?.connected || !sessionRef.current.joinToken) return;
        // An end is never dropped by the transport, an update may be
        (reliable ? socket : socket.volatile).emit("live", message);
      }),
    []
  );

  // Updates the throttle holds back go out on a later frame
  // We use requestAnimationFrame as setInterval was being blocked during
  // re-renders on Chrome with Windows
  const flushRequestRef = useRef<number>();
  function flushLater() {
    if (flushRequestRef.current !== undefined || !sender.waiting()) return;
    flushRequestRef.current = requestAnimationFrame((time) => {
      flushRequestRef.current = undefined;
      sender.flush(time);
      flushLater();
    });
  }
  useEffect(() => {
    return () => {
      if (flushRequestRef.current !== undefined) {
        cancelAnimationFrame(flushRequestRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleLive(message: ReceivedLiveMessage) {
      if (!message || message.sceneId !== sceneIdRef.current) return;
      changeMarks(afterLive(marksRef.current, message, performance.now()));
    }
    function handleSnapshot({ scene }: { scene: Scene | null }) {
      // The server ended our marks if it moved us; if it did not, the others
      // on the scene are still shown them
      sender.endAll();
      sceneIdRef.current = scene?.id ?? null;
      changeMarks(noLiveMarks);
      setCleared((count) => count + 1);
    }
    session.socket?.on("live", handleLive);
    session.socket?.on("scene_snapshot", handleSnapshot);
    return () => {
      session.socket?.off("live", handleLive);
      session.socket?.off("scene_snapshot", handleSnapshot);
    };
  }, [session.socket, sender]);

  useEffect(() => {
    function handleStatus(status: SessionStatus) {
      if (status === "joined") return;
      // The server ends a lost connection's marks, and sends none of the
      // others' again: the snapshot that follows starts the scene clean
      sender.reset();
      changeMarks(noLiveMarks);
      setCleared((count) => count + 1);
    }
    function handlePlayerLeft(connectionId: string) {
      changeMarks(withoutConnection(marksRef.current, connectionId));
    }
    session.on("status", handleStatus);
    session.on("playerLeft", handlePlayerLeft);
    return () => {
      session.off("status", handleStatus);
      session.off("playerLeft", handlePlayerLeft);
    };
  }, [session, sender]);

  const actions = useMemo<Omit<LiveStore, "cleared" | "held">>(
    () => ({
      send(kind, state) {
        const sceneId = sceneIdRef.current;
        const { socket, joinToken } = sessionRef.current;
        if (display || !sceneId || !socket?.connected || !joinToken) return;
        sender.update(sceneId, kind, state, performance.now());
        flushLater();
      },
      end: sender.end,
      hold,
      marks: () => marksRef.current,
      subscribe(listener) {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    }),
    // flushLater only reads refs and the sender
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sender, display, hold]
  );
  const store = useMemo(
    () => ({ ...actions, cleared, held }),
    [actions, cleared, held]
  );

  return <LiveContext.Provider value={store}>{children}</LiveContext.Provider>;
}

export function useLive() {
  const context = useContext(LiveContext);
  if (context === undefined) {
    throw new Error("useLive must be used within a LiveProvider");
  }
  return context;
}

/**
 * The live marks of one kind on the scene being viewed, by the connection
 * that sent them, smoothed between updates. Renders each frame a mark moves.
 */
export function useLiveMarks<K extends LiveKind>(
  kind: K
): Record<string, LiveState[K]> {
  const { marks, subscribe } = useLive();
  const [shown, setShown] = useState<Record<string, LiveState[K]>>({});

  useEffect(() => {
    let request: number | undefined;
    function draw() {
      request = undefined;
      const now = performance.now();
      const next = liveStatesAt(kind, marks(), now);
      setShown((previous) =>
        Object.keys(previous).length === 0 && Object.keys(next).length === 0
          ? previous
          : next
      );
      if (liveMoving(kind, marks(), now)) drawLater();
    }
    function drawLater() {
      if (request === undefined) request = requestAnimationFrame(draw);
    }
    drawLater();
    const unsubscribe = subscribe(drawLater);
    return () => {
      unsubscribe();
      if (request !== undefined) cancelAnimationFrame(request);
    };
  }, [kind, marks, subscribe]);

  return shown;
}

/**
 * What the drags received give the items of the scene being viewed, by item
 * id, smoothed between updates. An item this connection holds is left out.
 */
export function useLiveDrags(): Record<string, LiveTransform> {
  const { held } = useLive();
  const drags = useLiveMarks("drag");
  return useMemo(() => dragTransforms(drags, held), [drags, held]);
}

export default LiveContext;
