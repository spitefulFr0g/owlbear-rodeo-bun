import { useState, useEffect, useRef } from "react";
import { useToasts } from "react-toast-notifications";

import { useMapData } from "../contexts/MapDataContext";
import { useMapLoading } from "../contexts/MapLoadingContext";
import { useUserId } from "../contexts/UserIdContext";
import { useDatabase } from "../contexts/DatabaseContext";
import { useParty } from "../contexts/PartyContext";
import { useAssets } from "../contexts/AssetsContext";

import useDebounce from "../hooks/useDebounce";
import useNetworkedState from "../hooks/useNetworkedState";
import useMapActions from "../hooks/useMapActions";

import Session from "./Session";
import {
  AssetRequestError,
  downloadAsset,
  hasAsset,
  uploadAsset,
} from "./assetStore";

import Action from "../actions/Action";

import Map from "../components/map/Map";
import TokenBar from "../components/token/TokenBar";

import GlobalImageDrop from "../components/image/GlobalImageDrop";

import { Map as MapType } from "../types/Map";
import { MapState } from "../types/MapState";
import {
  AssetManifest,
  AssetManifestAsset,
  AssetManifestAssets,
} from "../types/Asset";
import { TokenState } from "../types/TokenState";
import { DrawingState } from "../types/Drawing";
import { FogState } from "../types/Fog";
import { Note } from "../types/Note";
import {
  AddStatesAction,
  EditStatesAction,
  RemoveStatesAction,
} from "../actions";

// Where an asset in the manifest is at in being sent to or loaded from the server
type AssetTransfer = {
  isBusy: boolean;
  done: boolean;
  // Failed attempts since the last success
  failures: number;
  // Time before which the transfer shouldn't be tried again
  retryAt: number;
  warned: boolean;
};

// Failed transfers are retried after 2s, 4s, 8s and so on up to this
const MAX_RETRY_DELAY = 30000;

function getErrorStatus(error: unknown) {
  return error instanceof AssetRequestError ? error.status : undefined;
}

/**
 * @typedef {object} NetworkedMapProps
 * @property {Session} session
 */

/**
 * @param {NetworkedMapProps} props
 */
function NetworkedMapAndTokens({ session }: { session: Session }) {
  const { addToast } = useToasts();
  const userId = useUserId();
  const partyState = useParty();
  const { assetLoadStart, assetProgressUpdate, assetLoadCancel, isLoading } =
    useMapLoading();

  const { updateMapState } = useMapData();
  const { getAsset, putAsset } = useAssets();

  const [currentMap, setCurrentMap] = useState<MapType | null>(null);
  const [currentMapState, setCurrentMapState] =
    useNetworkedState<MapState | null>(
      null,
      session,
      "map_state",
      500,
      true,
      "mapId"
    );
  const [assetManifest, setAssetManifest] =
    useNetworkedState<AssetManifest | null>(
      null,
      session,
      "manifest",
      500,
      true,
      "mapId"
    );

  async function loadAssetManifestFromMap(map: MapType, mapState: MapState) {
    const assets: AssetManifestAssets = {};
    const { owner } = map;
    let processedTokens = new Set();
    for (let tokenState of Object.values(mapState.tokens)) {
      if (tokenState.type === "file" && !processedTokens.has(tokenState.file)) {
        processedTokens.add(tokenState.file);
        assets[tokenState.file] = {
          id: tokenState.file,
          owner: tokenState.owner,
        };
      }
    }
    if (map.type === "file") {
      assets[map.thumbnail] = { id: map.thumbnail, owner };
      if (map.quality !== "original") {
        const qualityId = map.resolutions[map.quality];
        if (qualityId) {
          assets[qualityId] = { id: qualityId, owner };
        }
      } else {
        assets[map.file] = { id: map.file, owner };
      }
    }
    setAssetManifest({ mapId: map.id, assets }, true, true);
  }

  function addAssetsIfNeeded(assets: AssetManifestAsset[]) {
    setAssetManifest((prevManifest) => {
      if (prevManifest?.assets) {
        let newAssets = { ...prevManifest.assets };
        for (let asset of assets) {
          const id = asset.id;
          const exists = id in newAssets;
          if (!exists) {
            newAssets[id] = asset;
          }
        }
        return { ...prevManifest, assets: newAssets };
      }
      return prevManifest;
    });
  }

  // Join tokens come and go with the connection to the server
  const [joinToken, setJoinToken] = useState(session.joinToken);
  useEffect(() => {
    function handleStatus() {
      setJoinToken(session.joinToken);
    }
    session.on("status", handleStatus);
    return () => {
      session.off("status", handleStatus);
    };
  }, [session]);

  // Keep track of where each asset is at to prevent sending or loading them multiple times
  const assetTransfersRef = useRef<Record<string, AssetTransfer>>({});
  // Changed when a failed transfer is ready to be tried again
  const [retryCount, setRetryCount] = useState(0);
  const retryTimeoutsRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const retryTimeouts = retryTimeoutsRef.current;
    return () => {
      for (let timeout of retryTimeouts) {
        clearTimeout(timeout);
      }
      retryTimeouts.clear();
    };
  }, []);

  const partyStateRef = useRef(partyState);
  useEffect(() => {
    partyStateRef.current = partyState;
  });

  // Send the assets we own to the server and load everyone else's from it
  useEffect(() => {
    if (!assetManifest || !userId || !joinToken) {
      return;
    }
    const access = { url: session.brokerUrl, token: joinToken };

    function retryLater(transfer: AssetTransfer) {
      transfer.failures += 1;
      const delay = Math.min(1000 * 2 ** transfer.failures, MAX_RETRY_DELAY);
      transfer.retryAt = Date.now() + delay;
      // Wait a little longer than needed to be sure the delay has passed
      const timeout = setTimeout(() => {
        retryTimeoutsRef.current.delete(timeout);
        setRetryCount((count) => count + 1);
      }, delay + 50);
      retryTimeoutsRef.current.add(timeout);
    }

    // Only show one toast for an asset that keeps failing
    function warnOnce(transfer: AssetTransfer, message: string) {
      if (!transfer.warned) {
        transfer.warned = true;
        addToast(message);
      }
    }

    async function shareAsset(
      asset: AssetManifestAsset,
      transfer: AssetTransfer
    ) {
      try {
        if (!(await hasAsset(access, asset.id))) {
          const storedAsset = await getAsset(asset.id);
          if (!storedAsset) {
            retryLater(transfer);
            return;
          }
          await uploadAsset(access, storedAsset);
        }
        transfer.done = true;
      } catch (error) {
        const status = getErrorStatus(error);
        if (status === 400 || status === 413) {
          // Trying again won't change the answer
          transfer.done = true;
          addToast(
            status === 413
              ? "Unable to share image with the party as it is too large for the server"
              : "Unable to share image with the party"
          );
          return;
        }
        // The token is replaced when we rejoin so no need to warn about it
        if (status !== 401) {
          warnOnce(transfer, "Unable to share image with the party, retrying");
        }
        retryLater(transfer);
      }
    }

    async function loadAsset(
      asset: AssetManifestAsset,
      transfer: AssetTransfer
    ) {
      try {
        const cachedAsset = await getAsset(asset.id);
        if (cachedAsset) {
          transfer.done = true;
          return;
        }
        assetLoadStart(asset.id);
        const loadedAsset = await downloadAsset(
          access,
          asset.id,
          (loaded, total) => {
            // Hold the last step back until the asset has been saved
            if (loaded < total) {
              assetProgressUpdate({ id: asset.id, count: loaded, total });
            }
          }
        );
        await putAsset(loadedAsset);
        assetProgressUpdate({ id: asset.id, count: 1, total: 1 });
        transfer.done = true;
      } catch (error) {
        const status = getErrorStatus(error);
        const isMissing = status === 404;
        const isOwnerInParty = Object.values(partyStateRef.current).some(
          (player) => player.userId === asset.owner
        );
        // An asset the server doesn't have yet is most likely still being sent
        // by its owner, so leave the loading bar up for the first few tries
        const isWaitingForOwner =
          isMissing && isOwnerInParty && transfer.failures < 4;
        if (!isWaitingForOwner) {
          assetLoadCancel(asset.id);
        }
        if (isMissing) {
          if (!isOwnerInParty) {
            warnOnce(transfer, "Unable to find owner for asset");
          }
        } else if (status !== 401) {
          warnOnce(transfer, "Unable to load image from the server, retrying");
        }
        retryLater(transfer);
      }
    }

    for (let asset of Object.values(assetManifest.assets)) {
      let transfer = assetTransfersRef.current[asset.id];
      if (!transfer) {
        transfer = {
          isBusy: false,
          done: false,
          failures: 0,
          retryAt: 0,
          warned: false,
        };
        assetTransfersRef.current[asset.id] = transfer;
      }
      if (transfer.isBusy || transfer.done || Date.now() < transfer.retryAt) {
        continue;
      }
      // Ensure transfers are marked before any async operation to prevent them from starting twice
      transfer.isBusy = true;
      const currentTransfer = transfer;
      const run = asset.owner === userId ? shareAsset : loadAsset;
      run(asset, currentTransfer).finally(() => {
        currentTransfer.isBusy = false;
        if (currentTransfer.done) {
          currentTransfer.failures = 0;
          currentTransfer.warned = false;
        }
      });
    }
  }, [
    assetManifest,
    session,
    joinToken,
    retryCount,
    userId,
    addToast,
    getAsset,
    putAsset,
    assetLoadStart,
    assetProgressUpdate,
    assetLoadCancel,
  ]);

  /**
   * Map state
   */

  const { database } = useDatabase();
  // Sync the map state to the database after 500ms of inactivity
  const debouncedMapState = useDebounce(currentMapState, 500);
  useEffect(() => {
    if (
      debouncedMapState &&
      debouncedMapState.mapId &&
      currentMap &&
      currentMap?.owner === userId &&
      database
    ) {
      updateMapState(debouncedMapState.mapId, debouncedMapState);
    }
  }, [currentMap, debouncedMapState, userId, database, updateMapState]);

  async function handleMapChange(
    newMap: MapType | null,
    newMapState: MapState | null
  ) {
    // Clear map before sending new one
    setCurrentMap(null);
    session.socket?.emit("map", null);

    setCurrentMapState(newMapState, true, true);
    setCurrentMap(newMap);

    session.socket?.emit("map", newMap);

    if (!newMap || !newMapState) {
      setAssetManifest(null, true, true);
      return;
    }

    await loadAssetManifestFromMap(newMap, newMapState);
  }

  const [mapActions, addActions, updateActionIndex, resetActions] =
    useMapActions(setCurrentMapState);

  function handleMapReset(newMapState: MapState) {
    setCurrentMapState(newMapState, true, true);
    resetActions();
  }

  function handleMapDraw(action: Action<DrawingState>) {
    addActions([{ type: "drawings", action }]);
  }

  function handleFogDraw(action: Action<FogState>) {
    addActions([{ type: "fogs", action }]);
  }

  function handleUndo() {
    updateActionIndex(-1);
  }

  function handleRedo() {
    updateActionIndex(1);
  }

  // If map changes clear map actions
  const previousMapIdRef = useRef<string>();
  useEffect(() => {
    if (currentMap && currentMap?.id !== previousMapIdRef.current) {
      resetActions();
      previousMapIdRef.current = currentMap?.id;
    }
  }, [currentMap, resetActions]);

  function handleNoteCreate(notes: Note[]) {
    const action = new AddStatesAction(notes);
    addActions([{ type: "notes", action }]);
  }

  function handleNoteChange(changes: Record<string, Partial<Note>>) {
    let edits: Partial<Note>[] = [];
    for (let id in changes) {
      edits.push({ ...changes[id], id });
    }
    const action = new EditStatesAction(edits);
    addActions([{ type: "notes", action }]);
  }

  function handleNoteRemove(noteIds: string[]) {
    const action = new RemoveStatesAction<Note>(noteIds);
    addActions([{ type: "notes", action }]);
  }

  /**
   * Token state
   */

  async function handleMapTokensStateCreate(tokenStates: TokenState[]) {
    if (!currentMap || !currentMapState) {
      return;
    }

    let assets: AssetManifestAsset[] = [];
    for (let tokenState of tokenStates) {
      if (tokenState.type === "file") {
        assets.push({ id: tokenState.file, owner: tokenState.owner });
      }
    }
    if (assets.length > 0) {
      addAssetsIfNeeded(assets);
    }

    const action = new AddStatesAction(tokenStates);
    addActions([{ type: "tokens", action }]);
  }

  function handleMapTokenStateChange(
    changes: Record<string, Partial<TokenState>>
  ) {
    let edits: Partial<TokenState>[] = [];
    for (let id in changes) {
      edits.push({ ...changes[id], id });
    }
    const action = new EditStatesAction(edits);
    addActions([{ type: "tokens", action }]);
  }

  function handleMapTokenStateRemove(tokenStateIds: string[]) {
    const action = new RemoveStatesAction<TokenState>(tokenStateIds);
    addActions([{ type: "tokens", action }]);
  }

  function handleSelectionItemsChange(
    tokenChanges: Record<string, Partial<TokenState>>,
    noteChanges: Record<string, Partial<Note>>
  ) {
    let tokenEdits: Partial<TokenState>[] = [];
    for (let id in tokenChanges) {
      tokenEdits.push({ ...tokenChanges[id], id });
    }
    const tokenAction = new EditStatesAction(tokenEdits);

    let noteEdits: Partial<Note>[] = [];
    for (let id in noteChanges) {
      noteEdits.push({ ...noteChanges[id], id });
    }
    const noteAction = new EditStatesAction(noteEdits);

    addActions([
      { type: "tokens", action: tokenAction },
      { type: "notes", action: noteAction },
    ]);
  }

  function handleSelectionItemsRemove(
    tokenStateIds: string[],
    noteIds: string[]
  ) {
    const tokenAction = new RemoveStatesAction<TokenState>(tokenStateIds);
    const noteAction = new RemoveStatesAction<Note>(noteIds);
    addActions([
      { type: "tokens", action: tokenAction },
      { type: "notes", action: noteAction },
    ]);
  }

  function handleSelectionItemsCreate(
    tokenStates: TokenState[],
    notes: Note[]
  ) {
    const tokenAction = new AddStatesAction(tokenStates);
    const noteAction = new AddStatesAction(notes);
    addActions([
      { type: "tokens", action: tokenAction },
      { type: "notes", action: noteAction },
    ]);
  }

  useEffect(() => {
    async function handleSocketMap(map?: MapType) {
      if (map) {
        setCurrentMap(map);
      } else {
        setCurrentMap(null);
      }
    }

    session.socket?.on("map", handleSocketMap);

    return () => {
      session.socket?.off("map", handleSocketMap);
    };
  });

  const canChangeMap = !isLoading;

  return (
    <GlobalImageDrop
      onMapChange={handleMapChange}
      onMapTokensStateCreate={handleMapTokensStateCreate}
    >
      <Map
        map={currentMap}
        mapState={currentMapState}
        mapActions={mapActions}
        onMapTokenStateChange={handleMapTokenStateChange}
        onMapTokenStateRemove={handleMapTokenStateRemove}
        onMapTokensStateCreate={handleMapTokensStateCreate}
        onSelectionItemsChange={handleSelectionItemsChange}
        onSelectionItemsRemove={handleSelectionItemsRemove}
        onSelectionItemsCreate={handleSelectionItemsCreate}
        onMapChange={handleMapChange}
        onMapReset={handleMapReset}
        onMapDraw={handleMapDraw}
        onFogDraw={handleFogDraw}
        onMapNoteCreate={handleNoteCreate}
        onMapNoteChange={handleNoteChange}
        onMapNoteRemove={handleNoteRemove}
        allowMapChange={canChangeMap}
        session={session}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <TokenBar onMapTokensStateCreate={handleMapTokensStateCreate} />
    </GlobalImageDrop>
  );
}

export default NetworkedMapAndTokens;
