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
import useSetting from "../hooks/useSetting";
import { useKeyboard, useBlur } from "../contexts/KeyboardContext";
import shortcuts from "../shortcuts";
import { snapPosition } from "./grid";

import { useUserId } from "../contexts/UserIdContext";

import { canPlaceImage, getToolPermissions, defaultRoomSwitches } from "../helpers/roomControls";
import { SceneList } from "../helpers/sceneList";

import { downloadAsset, hasAsset, uploadAsset } from "../network/assetStore";
import Session, { SessionStatus } from "../network/Session";

import {
  Batch,
  Change,
  gmOwner,
  Item,
  mayChange,
  Scene,
  Vector2,
} from "../sceneRules";

import { RoomSwitches } from "../types/Room";
import { Token } from "../types/Token";

import {
  afterAnswer,
  afterChanges,
  afterSettings,
  BatchAnswer,
  imageFiles,
  imagesInOrder,
  RelayedChanges,
  SceneSettings,
  SettingsChange,
  shownScene,
} from "./shown";
import { emptyHistory, History, remember, historyChanges, dropStep } from "./history";
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
  selection: string[];
  setSelection: React.Dispatch<React.SetStateAction<string[]>>;
  person: Person;
  switches: RoomSwitches;
  /** The room's scenes as the server last listed them, null for anyone but a GM */
  sceneList: SceneList | null;
  /** Not connected, no snapshot yet, or waiting for the scene asked for */
  readOnly: boolean;
  /**
   * One action: every change in it shows at once and goes to the server as
   * one batch. Map picking passes false to keep it out of history.
   * False when nothing was sent, as the canvas is read-only.
   */
  act: (changes: Change[], recordHistory?: boolean) => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canChange: (change: Change) => boolean;
  canSelect: (item: Item) => boolean;
  /**
   * Changes settings of the scene for everyone viewing it: any of its grid,
   * Fog Fill and view-only. They show once the server has accepted them,
   * which it does from a GM only. Not in the undo history.
   */
  setSettings: (settings: Partial<SceneSettings>) => void;
  /**
   * Moves this GM connection to another scene. The canvas is read-only until
   * its snapshot arrives. Not in the undo history.
   */
  viewScene: (sceneId: string) => Promise<SceneAnswer>;
  /** Makes an empty scene and moves this GM connection to it, as viewScene does */
  createScene: (name: string) => Promise<SceneAnswer>;
  /** Puts stored files this browser holds on the server, for an item to name */
  share: (files: string[]) => Promise<void>;
};

/** The server's answer to a scene action */
export type SceneAnswer = { ok: boolean; error?: string; sceneId?: string };

const SceneContext = React.createContext<SceneStore | undefined>(undefined);

type SceneProviderProps = {
  session: Session;
  /** This page joined as a cast display, not as a person */
  display?: boolean;
  children: React.ReactNode;
};

/** What the server last sent, and this connection's batches it has not answered yet */
type Held = { server: Scene | null; unconfirmed: Batch[] };

const nothingHeld: Held = { server: null, unconfirmed: [] };

/**
 * Holds the scene of the room this session has joined: what the server last
 * sent, with this connection's unconfirmed changes shown on top
 */
export function SceneProvider({
  session,
  display = false,
  children,
}: SceneProviderProps) {
  const userId = useUserId();
  const role = useRole();
  const room = useRoom();
  const { getAsset, putAsset } = useAssets();

  const [selection, setSelection] = useState<string[]>([]);
  const [held, setHeld] = useState(nothingHeld);
  const heldRef = useRef(held);
  const [history, setHistory] = useState<History>(emptyHistory);
  const historyRef = useRef(history);
  const pendingHistory = useRef<Record<string, string>>({});
  function changeHistory(next: History) {
    historyRef.current = next;
    setHistory(next);
  }
  function changeHeld(update: (held: Held) => Held) {
    heldRef.current = update(heldRef.current);
    setHeld(heldRef.current);
  }
  const sceneRef = useRef<Scene | null>(held.server);
  const scene = useMemo(
    () => shownScene(held.server, held.unconfirmed),
    [held]
  );

  sceneRef.current = scene;

  const [sceneList, setSceneList] = useState<SceneList | null>(null);
  // The latest request for another scene the server has not answered yet
  const [asking, setAsking] = useState<object | null>(null);
  const askingRef = useRef(asking);
  function changeAsking(next: object | null) {
    askingRef.current = next;
    setAsking(next);
  }

  const [connected, setConnected] = useState(!!session.joinToken);
  useEffect(() => {
    function handleStatus(status: SessionStatus) {
      setConnected(status === "joined");
      // An answer to a request made before the connection dropped never comes
      if (status !== "joined") changeAsking(null);
    }
    session.on("status", handleStatus);
    return () => {
      session.off("status", handleStatus);
    };
  }, [session]);

  useEffect(() => {
    function handleSnapshot({ scene }: { scene: Scene }) {
      setSelection([]);
      changeHeld(() => ({ server: scene, unconfirmed: [] }));
      changeHistory(emptyHistory);
      pendingHistory.current = {};
    }
    function handleChanges(relayed: RelayedChanges) {
      changeHeld((held) => ({
        ...held,
        server: afterChanges(held.server, relayed),
      }));
    }
    function handleAnswer(answer: BatchAnswer) {
      if (heldRef.current.server?.id !== answer.sceneId) return;
      const stepId = pendingHistory.current[answer.batchId];
      if (stepId && answer.refused.length) changeHistory(dropStep(historyRef.current, stepId));
      delete pendingHistory.current[answer.batchId];
      changeHeld((held) => ({
        server: afterAnswer(held.server, answer),
        unconfirmed: held.unconfirmed.filter(
          (batch) => batch.id !== answer.batchId
        ),
      }));
    }
    function handleSettings(change: SettingsChange) {
      changeHeld((held) => ({ ...held, server: afterSettings(held.server, change) }));
    }
    session.socket?.on("scene_list", setSceneList);
    session.socket?.on("scene_snapshot", handleSnapshot);
    session.socket?.on("scene_changes", handleChanges);
    session.socket?.on("scene_answer", handleAnswer);
    session.socket?.on("scene_settings", handleSettings);
    return () => {
      session.socket?.off("scene_list", setSceneList);
      session.socket?.off("scene_snapshot", handleSnapshot);
      session.socket?.off("scene_changes", handleChanges);
      session.socket?.off("scene_answer", handleAnswer);
      session.socket?.off("scene_settings", handleSettings);
    };
  }, [session.socket]);

  // Outside a session only the GM is sent the scene
  const waiting = role !== "gm" && room.session === false;
  useEffect(() => {
    if (waiting) {
      changeHeld(() => nothingHeld);
      changeHistory(emptyHistory);
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

  const readOnly = !connected || !scene || !!asking;

  const person = useMemo<Person>(() => {
    if (display) return { role: "display", id: "" };
    if (role === "gm") return { role: "gm", id: gmOwner };
    return { role, id: userId || "" };
  }, [display, role, userId]);

  const switches = room.switches || defaultRoomSwitches;

  // Image availability is handled by the token bar; this gate covers item actions.
  const canChange = useCallback((change: Change) =>
    !readOnly && mayChange(person, { switches, knownImage: () => true },
      change.type === "add" ? undefined : scene?.items[change.id], change),
    [readOnly, person, switches, scene]);
  const canSelect = useCallback((item: Item) => canChange({
    type: "update", id: item.id, fields: { position: item.position },
  }), [canChange]);
  useEffect(() => {
    setSelection(previous => {
      const allowed = previous.filter(id => !!scene?.items[id] && canSelect(scene.items[id]));
      return allowed.length === previous.length ? previous : allowed;
    });
  }, [scene, canSelect]);

  const act = useCallback(
    (changes: Change[], recordHistory = true) => {
      const scene = shownScene(heldRef.current.server, heldRef.current.unconfirmed);
      // Nothing is queued while the connection is being restored
      if (!scene || !session.socket?.connected || !session.joinToken || askingRef.current) {
        return false;
      }
      changes = changes.filter(change => mayChange(person, { switches, knownImage: () => true },
        change.type === "add" ? undefined : scene.items[change.id], change));
      if (changes.length === 0) {
        return false;
      }
      const batch: Batch = { id: uuid(), sceneId: scene.id, changes };
      changeHeld((held) => ({
        ...held,
        unconfirmed: [...held.unconfirmed, batch],
      }));
      if (recordHistory) {
        changeHistory(remember(historyRef.current, scene, changes, batch.id));
        pendingHistory.current[batch.id] = batch.id;
      }
      session.socket.emit("scene_changes", batch);
      return true;
    },
    [session, person, switches]
  );

  const replay = useCallback((direction: "undo" | "redo") => {
    const scene = shownScene(heldRef.current.server, heldRef.current.unconfirmed);
    if (!scene || !session.socket?.connected || !session.joinToken || askingRef.current) return;
    const opposite = direction === "undo" ? "redo" : "undo";
    let next = historyRef.current;
    while (next[direction].length) {
      const step = next[direction][next[direction].length - 1];
      next = { ...next, [direction]: next[direction].slice(0, -1) };
      const changes = historyChanges(scene, step[direction]);
      if (!changes.length) continue;
      const batch: Batch = { id: uuid(), sceneId: scene.id, changes };
      changeHistory({ ...next, [opposite]: [...next[opposite], step].slice(-50) });
      pendingHistory.current[batch.id] = step.id;
      changeHeld(held => ({ ...held, unconfirmed: [...held.unconfirmed, batch] }));
      session.socket.emit("scene_changes", batch);
      return;
    }
    changeHistory(next);
  }, [session]);
  const undo = useCallback(() => replay("undo"), [replay]);
  const redo = useCallback(() => replay("redo"), [replay]);
  const canUndo = !readOnly && history.undo.length > 0;
  const canRedo = !readOnly && history.redo.length > 0;

  const setSettings = useCallback(
    (settings: Partial<SceneSettings>) => {
      const scene = sceneRef.current;
      if (!scene || !session.socket?.connected || !session.joinToken) {
        return;
      }
      session.socket.emit(
        "scene_settings",
        { sceneId: scene.id, ...settings },
        (answer: { ok: boolean; error?: string }) => {
          if (!answer.ok) {
            console.error(`Unable to change the scene's settings: ${answer.error}`);
          }
        }
      );
    },
    [session]
  );

  // The snapshot of the scene asked for is sent just before the answer
  const askForScene = useCallback(
    (event: "scene_view" | "scene_create", payload: Record<string, unknown>) =>
      new Promise<SceneAnswer>((resolve) => {
        if (!session.socket?.connected || !session.joinToken) {
          resolve({ ok: false, error: "offline" });
          return;
        }
        const request = {};
        changeAsking(request);
        session.socket.emit(event, payload, (answer: SceneAnswer) => {
          if (askingRef.current === request) changeAsking(null);
          resolve(answer);
        });
      }),
    [session]
  );
  const viewScene = useCallback(
    (sceneId: string) => askForScene("scene_view", { sceneId }),
    [askForScene]
  );
  const createScene = useCallback(
    (name: string) => askForScene("scene_create", { name }),
    [askForScene]
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

  const store = useMemo(
    () => ({
      scene,
      selection,
      setSelection,
      person,
      switches,
      sceneList: role === "gm" ? sceneList : null,
      readOnly,
      act,
      undo, redo, canUndo, canRedo,
      canChange,
      canSelect,
      setSettings,
      viewScene,
      createScene,
      share,
    }),
    [scene, selection, person, switches, role, sceneList, readOnly, act, undo, redo, canUndo, canRedo, canChange, canSelect, setSettings, viewScene, createScene, share]
  );

  return (
    <SceneContext.Provider value={store}>{children}</SceneContext.Provider>
  );
}

/** The scene list, null for anyone but a GM */
export function useSceneList() {
  return useScene().sceneList;
}

export function useScene() {
  const context = useContext(SceneContext);
  if (context === undefined) {
    throw new Error("useScene must be used within a SceneProvider");
  }
  return context;
}

/** Availability uses only images this connection can see in the scene. */
export function useCanPlaceToken() {
  const { scene, person, switches, readOnly } = useScene();
  const files = useMemo(() => scene
    ? imagesInOrder(scene).reduce<string[]>((files, item) => files.concat(imageFiles(item)), [])
    : [], [scene]);
  const permissions = getToolPermissions(person.role === "display" ? "player" : person.role, switches);
  return (token: Token) => !readOnly && person.role !== "display" &&
    canPlaceImage(token, permissions, files);
}

/**
 * Adds tokens to the scene as Image items, the first centred on a point of
 * the page and each one after it a step down and to the right.
 */
export function useAddTokens() {
  const { scene, person, readOnly, act, share } = useScene();
  const canPlaceToken = useCanPlaceToken();
  const mapStageRef = useMapStage();
  const [sensitivity] = useSetting<number>("map.gridSnappingSensitivity");
  const suspended = useRef(false);
  useKeyboard(
    (event) => {
      if (shortcuts.disableSnapping(event)) suspended.current = true;
    },
    (event) => {
      if (shortcuts.disableSnapping(event)) suspended.current = false;
    }
  );
  useBlur(() => {
    suspended.current = false;
  });

  return async function addTokens(
    tokens: Token[],
    clientPosition: Vector2,
    checkMapBounds = true
  ) {
    tokens = tokens.filter(canPlaceToken);
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
        snapPosition(
          scene.grid,
          { x: position.x + step * index, y: position.y + step * index },
          scene.grid.snap && !suspended.current ? sensitivity : 0
        ),
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
