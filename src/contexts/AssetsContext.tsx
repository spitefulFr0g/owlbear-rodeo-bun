import React, { useState, useContext, useCallback, useEffect, useRef } from "react";
import useDebounce from "../hooks/useDebounce";

import { omit } from "../helpers/shared";
import { shownFile } from "../helpers/shownFile";
import { Asset } from "../types/Asset";
import { createAssetCache } from "../helpers/assetCache";
import { downloadAsset } from "../network/assetStore";
import { sessionLibraryAccess } from "../network/library";
import Session, { SessionStatus } from "../network/Session";

export type GetAssetEventHanlder = (
  assetId: string
) => Promise<Asset>;
export type AddAssetsEventHandler = (assets: Asset[]) => Promise<void>;
export type PutAssetEventsHandler = (asset: Asset) => Promise<void>;

type AssetsContextValue = {
  assetVersion: number;
  getAsset: GetAssetEventHanlder;
  addAssets: AddAssetsEventHandler;
  putAsset: PutAssetEventsHandler;
};

const AssetsContext =
  React.createContext<AssetsContextValue | undefined>(undefined);

// Server assets are cached for this page only, never in the browser database.
export function AssetsProvider({ session, children }: { session: Session; children: React.ReactNode }) {
  const assets = useRef(createAssetCache());
  const [assetVersion, setAssetVersion] = useState(0);
  useEffect(() => {
    const retryDownloads = (status: SessionStatus) => {
      if (status !== "joined") return;
      // The new join token can retry missing URLs even if an old request hangs.
      assets.current.resetPending();
      setAssetVersion(version => version + 1);
    };
    session.on("status", retryDownloads);
    return () => { session.off("status", retryDownloads); };
  }, [session]);
  const getAsset = useCallback<GetAssetEventHanlder>(async id =>
    assets.current.get(id, () => downloadAsset(sessionLibraryAccess(session), id)), [session]);
  const addAssets = useCallback<AddAssetsEventHandler>(async incoming => {
    for (const asset of incoming) assets.current.put(asset);
    setAssetVersion(version => version + 1);
  }, []);
  const putAsset = useCallback<PutAssetEventsHandler>(async asset => {
    assets.current.put(asset);
    setAssetVersion(version => version + 1);
  }, []);
  return <AssetsContext.Provider value={{ getAsset, addAssets, putAsset, assetVersion }}>{children}</AssetsContext.Provider>;
}

export function useAssets() {
  const context = useContext(AssetsContext);
  if (context === undefined) {
    throw new Error("useAssets must be used within a AssetsProvider");
  }
  return context;
}

/**
 * @typedef AssetURL
 * @property {string} url
 * @property {string} id
 * @property {number} references
 */

type AssetURL = {
  url: string | null;
  id: string;
  references: number;
};

type AssetURLs = Record<string, AssetURL>;

export const AssetURLsStateContext =
  React.createContext<AssetURLs | undefined>(undefined);

export const AssetURLsUpdaterContext =
  React.createContext<
    React.Dispatch<React.SetStateAction<AssetURLs>> | undefined
  >(undefined);

/**
 * Helper to manage sharing of custom image sources between uses of useAssetURL
 */
export function AssetURLsProvider({ children }: { children: React.ReactNode }) {
  const [assetURLs, setAssetURLs] = useState<AssetURLs>({});
  const { getAsset, assetVersion } = useAssets();

  // Keep track of the assets that need to be loaded
  const [assetKeys, setAssetKeys] = useState<string[]>([]);

  // Load assets after 100ms
  const loadingDebouncedAssetURLs = useDebounce(assetURLs, 100);

  // Update the asset keys to load when a url is added without an asset attached
  useEffect(() => {
    if (!loadingDebouncedAssetURLs) {
      return;
    }
    let keysToLoad: string[] = [];
    for (let url of Object.values(loadingDebouncedAssetURLs)) {
      if (url.url === null && url.references > 0) {
        keysToLoad.push(url.id);
      }
    }
    setAssetKeys(keysToLoad);
  }, [loadingDebouncedAssetURLs]);

  useEffect(() => {
    let cancelled = false;
    if (!assetKeys.length) return;
    Promise.all(assetKeys.map(id => getAsset(id).catch(() => undefined))).then(assets => {
      if (cancelled) return;
      setAssetURLs(prev => {
        const next = { ...prev };
        let changed = false;
        for (const asset of assets) {
          if (asset && next[asset.id]?.url === null) {
            changed = true;
            next[asset.id] = { ...next[asset.id], url: URL.createObjectURL(new Blob([asset.file], { type: asset.mime })) };
          }
        }
        return changed ? next : prev;
      });
    });
    return () => { cancelled = true; };
  }, [assetKeys, getAsset, assetVersion]);

  // Clean up asset URLs every minute
  const cleanUpDebouncedAssetURLs = useDebounce(assetURLs, 60 * 1000);

  // Revoke url when no more references
  useEffect(() => {
    setAssetURLs((prevURLs) => {
      let urlsToCleanup = [];
      for (let url of Object.values(prevURLs)) {
        if (url.references <= 0) {
          url.url && URL.revokeObjectURL(url.url);
          urlsToCleanup.push(url.id);
        }
      }
      if (urlsToCleanup.length > 0) {
        return omit(prevURLs, urlsToCleanup);
      } else {
        return prevURLs;
      }
    });
  }, [cleanUpDebouncedAssetURLs]);

  return (
    <AssetURLsStateContext.Provider value={assetURLs}>
      <AssetURLsUpdaterContext.Provider value={setAssetURLs}>
        {children}
      </AssetURLsUpdaterContext.Provider>
    </AssetURLsStateContext.Provider>
  );
}

/**
 * Helper function to load either file or default asset into a URL
 */
export function useAssetURL(
  assetId: string | null,
  type: "file" | "default" | null,
  defaultSources: Record<string, string>,
  unknownSource?: string
) {
  const assetURLs = useContext(AssetURLsStateContext);
  if (assetURLs === undefined) {
    throw new Error("useAssetURL must be used within a AssetURLsProvider");
  }
  const setAssetURLs = useContext(AssetURLsUpdaterContext);
  if (setAssetURLs === undefined) {
    throw new Error("useAssetURL must be used within a AssetURLsProvider");
  }

  useEffect(() => {
    if (!assetId || type !== "file") {
      return;
    }
    const updateAssetURL = () => {
      const increaseReferences = (prevURLs: AssetURLs): AssetURLs => {
        return {
          ...prevURLs,
          [assetId]: {
            ...prevURLs[assetId],
            references: prevURLs[assetId].references + 1,
          },
        };
      };

      const createReference = (prevURLs: AssetURLs): AssetURLs => {
        return {
          ...prevURLs,
          [assetId]: { url: null, id: assetId, references: 1 },
        };
      };
      setAssetURLs?.((prevURLs) => {
        if (assetId in prevURLs) {
          // Check if the asset url is already added and increase references
          return increaseReferences(prevURLs);
        } else {
          return createReference(prevURLs);
        }
      });
    };

    updateAssetURL();

    return () => {
      // Decrease references
      setAssetURLs((prevURLs) => {
        if (assetId in prevURLs) {
          return {
            ...prevURLs,
            [assetId]: {
              ...prevURLs[assetId],
              references: prevURLs[assetId].references - 1,
            },
          };
        } else {
          return prevURLs;
        }
      });
    };
  }, [assetId, setAssetURLs, type]);

  if (!assetId) {
    return unknownSource;
  }

  if (type === "default") {
    return defaultSources[assetId];
  }

  if (type === "file") {
    return assetURLs[assetId]?.url || unknownSource;
  }

  return unknownSource;
}

type FileData = {
  file: string;
  type: "file";
  thumbnail?: string;
  quality?: string;
  resolutions?: Record<string, string>;
};

type DefaultData = {
  key: string;
  type: "default";
};

/**
 * Load a map or token into a URL taking into account a thumbnail and multiple resolutions
 */
export function useDataURL(
  data: FileData | DefaultData | null,
  defaultSources: Record<string, string>,
  unknownSource: string | undefined = undefined,
  thumbnail = false
) {
  const [assetId, setAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setAssetId(shownFile(data, thumbnail) || null);
    }
  }, [data, thumbnail]);

  const assetURL = useAssetURL(
    assetId || null,
    data?.type || null,
    defaultSources,
    unknownSource
  );
  return assetURL;
}

export default AssetsContext;
