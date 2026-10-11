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
import { MapRect } from "../helpers/displayView";
import { PlayerView } from "../helpers/playerView";
import { SceneList } from "../helpers/sceneList";

import { downloadAsset, hasAsset, uploadAsset } from "../network/assetStore";
import Session, { SessionStatus } from "../network/Session";

import {
  Batch,
  Change,
  gmOwner,
  Item,
  mayChange,
  mayChangeNothing,
  Scene,
  SceneGrid,
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
import { clientPositionToWorld, visibleWorldRect } from "./worldPosition";

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
  /**
   * The view a GM last carried to this player or trusted player, a new object
   * each time. Null once another snapshot arrives, and for a GM and a cast display.
   */
  playerView: PlayerView | null;
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
  /**
   * Makes a scene and moves this GM connection to it, as viewScene does. It is
   * empty unless made from a map, whose files the server must already hold.
   */
  createScene: (
    name: string,
    from?: { grid: SceneGrid; map: Item; fogFill?: boolean }
  ) => Promise<SceneAnswer>;
  /** Sets a scene's name. The scene list shows it once the server has */
  renameScene: (sceneId: string, name: string) => Promise<SceneAnswer>;
  /** Copies a scene in this room without moving anyone. Not in undo history. */
  duplicateScene: (sceneId: string) => Promise<SceneAnswer>;
  /**
   * Removes a scene and everything on it, for good. The server refuses the
   * open scene, and moves a GM connection viewing the scene to the open scene.
   */
  deleteScene: (sceneId: string) => Promise<SceneAnswer>;
  /**
   * Show to players: makes the scene this GM connection is viewing the open
   * scene, carrying a view of it in world units for players and cast displays
   * to start at. Not in the undo history.
   */
  showScene: (sceneId: string, view: MapRect) => Promise<SceneAnswer>;
  /**
   * Bring players here: moves every player and trusted player on the open
   * scene to a view of it in world units, once. The server refuses it outside
   * a session and from a GM connection viewing another scene. Nothing is
   * saved, and it is not in the undo history.
   */
  bringPlayers: (view: MapRect) => Promise<SceneAnswer>;
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
  const [playerView, setPlayerView] = useState<PlayerView | null>(null);
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
      // A carried view follows the snapshot of its scene
      setPlayerView(null);
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
    session.socket?.on("player_view", setPlayerView);
    return () => {
      session.socket?.off("scene_list", setSceneList);
      session.socket?.off("scene_snapshot", handleSnapshot);
      session.socket?.off("scene_changes", handleChanges);
      session.socket?.off("scene_answer", handleAnswer);
      session.socket?.off("scene_settings", handleSettings);
      session.socket?.off("player_view", setPlayerView);
    };
  }, [session.socket]);

  // Outside a session only the GM is sent the scene
  const waiting = role !== "gm" && room.session === false;
  useEffect(() => {
    if (waiting) {
      changeHeld(() => nothingHeld);
      changeHistory(emptyHistory);
      setPlayerView(null);
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
  const viewOnly = !!scene?.viewOnly;

  // Image availability is handled by the token bar; this gate covers item actions.
  const canChange = useCallback((change: Change) =>
    !readOnly && mayChange(person, { switches, viewOnly, knownImage: () => true },
      change.type === "add" ? undefined : scene?.items[change.id], change),
    [readOnly, person, switches, viewOnly, scene]);
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
      const rules = { switches, viewOnly: scene.viewOnly, knownImage: () => true };
      changes = changes.filter(change => mayChange(person, rules,
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
  // A step made before the scene became view-only would only be refused
  const replays = !readOnly && !mayChangeNothing(person.role, { viewOnly });
  const canUndo = replays && history.undo.length > 0;
  const canRedo = replays && history.redo.length > 0;

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
    (name: string, from?: { grid: SceneGrid; map: Item; fogFill?: boolean }) =>
      askForScene("scene_create", { name, ...from }),
    [askForScene]
  );

  // Scene actions that move this connection nowhere by asking
  const askForList = useCallback(
    (
      event: "scene_rename" | "scene_delete" | "scene_show" | "scene_bring" | "scene_duplicate",
      payload: Record<string, unknown>
    ) =>
      new Promise<SceneAnswer>((resolve) => {
        if (!session.socket?.connected || !session.joinToken) {
          resolve({ ok: false, error: "offline" });
          return;
        }
        session.socket.emit(event, payload, resolve);
      }),
    [session]
  );
  const renameScene = useCallback(
    (sceneId: string, name: string) =>
      askForList("scene_rename", { sceneId, name }),
    [askForList]
  );
  const duplicateScene = useCallback(
    (sceneId: string) => askForList("scene_duplicate", { sceneId }),
    [askForList]
  );
  const deleteScene = useCallback(
    (sceneId: string) => askForList("scene_delete", { sceneId }),
    [askForList]
  );

  const showScene = useCallback(
    (sceneId: string, { x, y, width, height }: MapRect) =>
      askForList("scene_show", { sceneId, view: { x, y, width, height } }),
    [askForList]
  );

  const bringPlayers = useCallback(
    ({ x, y, width, height }: MapRect) =>
      askForList("scene_bring", { view: { x, y, width, height } }),
    [askForList]
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
      playerView,
      readOnly,
      act,
      undo, redo, canUndo, canRedo,
      canChange,
      canSelect,
      setSettings,
      viewScene,
      createScene,
      renameScene,
      deleteScene,
      duplicateScene,
      showScene,
      bringPlayers,
      share,
    }),
    [scene, selection, person, switches, role, sceneList, playerView, readOnly, act, undo, redo, canUndo, canRedo, canChange, canSelect, setSettings, viewScene, createScene, renameScene, deleteScene, duplicateScene, showScene, bringPlayers, share]
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

/** The tools the room's switches and the scene viewed leave this connection */
export function useToolPermissions() {
  const { scene, switches } = useScene();
  return getToolPermissions(useRole(), switches, scene?.viewOnly);
}

/**
 * Show to players, with this window's view of the scene as the view carried.
 * A scene this GM connection is not viewing is opened first.
 */
export function useShowToPlayers() {
  const { scene, viewScene, showScene } = useScene();
  const mapStageRef = useMapStage();

  return async function showToPlayers(sceneId: string): Promise<SceneAnswer> {
    if (scene?.id !== sceneId) {
      const answer = await viewScene(sceneId);
      if (!answer.ok) return answer;
    }
    // The stage keeps its pan and zoom from one scene to the next
    const view = mapStageRef.current && visibleWorldRect(mapStageRef.current);
    if (!view) return { ok: false, error: "no_view" };
    return showScene(sceneId, view);
  };
}

/** Bring players here, with this window's view of the open scene as the view carried */
export function useBringPlayers() {
  const { bringPlayers } = useScene();
  const mapStageRef = useMapStage();

  return async function bringPlayersHere(): Promise<SceneAnswer> {
    const view = mapStageRef.current && visibleWorldRect(mapStageRef.current);
    if (!view) return { ok: false, error: "no_view" };
    return bringPlayers(view);
  };
}

/** Availability uses only images this connection can see in the scene. */
export function useCanPlaceToken() {
  const { scene, person, switches, readOnly } = useScene();
  const files = useMemo(() => scene
    ? imagesInOrder(scene).reduce<string[]>((files, item) => files.concat(imageFiles(item)), [])
    : [], [scene]);
  const permissions = getToolPermissions(
    person.role === "display" ? "player" : person.role, switches, scene?.viewOnly);
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
