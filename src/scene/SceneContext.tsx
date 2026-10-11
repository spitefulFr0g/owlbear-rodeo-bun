import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { v4 as uuid } from "uuid";

import { useAssets } from "../contexts/AssetsContext";
import { useMapStage } from "../contexts/MapStageContext";
import { useRole, useRoom } from "../contexts/RoomContext";
import { useUserId } from "../contexts/UserIdContext";

import { defaultRoomSwitches } from "../helpers/roomControls";

import { downloadAsset, hasAsset, uploadAsset } from "../network/assetStore";
import Session, { SessionStatus } from "../network/Session";

import { Batch, Change, gmOwner, Scene, Vector2 } from "../sceneRules";

import { RoomSwitches } from "../types/Room";
import { Token } from "../types/Token";

import {
  afterAnswer,
  afterChanges,
  BatchAnswer,
  imageFiles,
  imagesInOrder,
  RelayedChanges,
} from "./shown";
import { tokenItem } from "./tokenItem";
import { clientPositionToWorld } from "./worldPosition";

/** Who this connection is to the scene rules */
export type Person = {
  role: "gm" | "trusted" | "player" | "display";
  // gmOwner for a GM connection, else the browser id ("" for a cast display)
  id: string;
};

type SceneStore = {
  /** The scene as shown, null until the server sends one */
  scene: Scene | null;
  person: Person;
  switches: RoomSwitches;
  /** Not connected, or no snapshot yet */
  readOnly: boolean;
  /** One action: every change in it goes to the server as one batch */
  act: (changes: Change[]) => void;
  /** Puts stored files this browser holds on the server, for an item to name */
  share: (files: string[]) => Promise<void>;
};

const SceneContext = React.createContext<SceneStore | undefined>(undefined);

type SceneProviderProps = {
  session: Session;
  /** This page joined as a cast display, not as a person */
  display?: boolean;
  children: React.ReactNode;
};

/** Holds the scene of the room this session has joined, as the server last sent it */
export function SceneProvider({
  session,
  display = false,
  children,
}: SceneProviderProps) {
  const userId = useUserId();
  const role = useRole();
  const room = useRoom();
  const { getAsset, putAsset } = useAssets();

  const [scene, setScene] = useState<Scene | null>(null);
  const sceneRef = useRef(scene);
  useEffect(() => {
    sceneRef.current = scene;
  });

  const [connected, setConnected] = useState(!!session.joinToken);
  useEffect(() => {
    function handleStatus(status: SessionStatus) {
      setConnected(status === "joined");
    }
    session.on("status", handleStatus);
    return () => {
      session.off("status", handleStatus);
    };
  }, [session]);

  useEffect(() => {
    function handleSnapshot({ scene }: { scene: Scene }) {
      setScene(scene);
    }
    function handleChanges(relayed: RelayedChanges) {
      setScene((scene) => afterChanges(scene, relayed));
    }
    function handleAnswer(answer: BatchAnswer) {
      setScene((scene) => afterAnswer(scene, answer));
    }
    session.socket?.on("scene_snapshot", handleSnapshot);
    session.socket?.on("scene_changes", handleChanges);
    session.socket?.on("scene_answer", handleAnswer);
    return () => {
      session.socket?.off("scene_snapshot", handleSnapshot);
      session.socket?.off("scene_changes", handleChanges);
      session.socket?.off("scene_answer", handleAnswer);
    };
  }, [session.socket]);

  // Outside a session only the GM is sent the scene
  const waiting = role !== "gm" && room.session === false;
  useEffect(() => {
    if (waiting) {
      setScene(null);
    }
  }, [waiting]);

  // Fetch the files the scene's images name, the local database then draws them
  const fetchedRef = useRef(new Set<string>());
  useEffect(() => {
    const token = session.joinToken;
    if (!scene || !connected || !token) {
      return;
    }
    const access = { url: session.brokerUrl, token };
    async function fetchFile(file: string) {
      try {
        if (!(await getAsset(file))) {
          await putAsset(await downloadAsset(access, file));
        }
      } catch (error) {
        // Try again the next time the scene changes or the connection returns
        fetchedRef.current.delete(file);
      }
    }
    for (const item of imagesInOrder(scene)) {
      for (const file of imageFiles(item)) {
        if (!fetchedRef.current.has(file)) {
          fetchedRef.current.add(file);
          fetchFile(file);
        }
      }
    }
  }, [scene, connected, session, getAsset, putAsset]);

  const readOnly = !connected || !scene;

  const act = useCallback(
    (changes: Change[]) => {
      const scene = sceneRef.current;
      if (!scene || !session.joinToken || changes.length === 0) {
        return;
      }
      const batch: Batch = { id: uuid(), sceneId: scene.id, changes };
      session.socket?.emit("scene_changes", batch);
    },
    [session]
  );

  const share = useCallback(
    async (files: string[]) => {
      const token = session.joinToken;
      if (!token) {
        throw new Error("Unable to share files: not in a room");
      }
      const access = { url: session.brokerUrl, token };
      for (const file of files) {
        if (await hasAsset(access, file)) {
          continue;
        }
        const asset = await getAsset(file);
        if (!asset) {
          throw new Error(`Unable to share file ${file}: not stored here`);
        }
        await uploadAsset(access, asset);
        // No need to fetch back what this browser already holds
        fetchedRef.current.add(file);
      }
    },
    [session, getAsset]
  );

  const person = useMemo<Person>(() => {
    if (display) return { role: "display", id: "" };
    if (role === "gm") return { role: "gm", id: gmOwner };
    return { role, id: userId || "" };
  }, [display, role, userId]);

  const switches = room.switches || defaultRoomSwitches;

  const store = useMemo(
    () => ({ scene, person, switches, readOnly, act, share }),
    [scene, person, switches, readOnly, act, share]
  );

  return (
    <SceneContext.Provider value={store}>{children}</SceneContext.Provider>
  );
}

export function useScene() {
  const context = useContext(SceneContext);
  if (context === undefined) {
    throw new Error("useScene must be used within a SceneProvider");
  }
  return context;
}

/**
 * Adds tokens to the scene as Image items, the first centred on a point of
 * the page and each one after it a step down and to the right.
 */
export function useAddTokens() {
  const { scene, person, readOnly, act, share } = useScene();
  const mapStageRef = useMapStage();

  return async function addTokens(
    tokens: Token[],
    clientPosition: Vector2,
    checkMapBounds = true
  ) {
    const mapStage = mapStageRef.current;
    if (!scene || readOnly || !mapStage || tokens.length === 0) {
      return;
    }
    const position = clientPositionToWorld(
      mapStage,
      clientPosition,
      checkMapBounds
    );
    if (!position) {
      return;
    }
    const step = scene.grid.unitsPerCell / 4;
    const items = tokens.map((token, index) =>
      tokenItem(
        token,
        { x: position.x + step * index, y: position.y + step * index },
        scene.grid,
        person.id,
        uuid()
      )
    );
    try {
      // The server must hold an image's bytes before an item names them
      const files: string[] = [];
      for (const item of items) {
        files.push(...imageFiles(item));
      }
      await share(files);
    } catch (error) {
      console.error(error);
      return;
    }
    act(items.map((item) => ({ type: "add", item })));
  };
}

export default SceneContext;
