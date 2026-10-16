import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import Session from "../network/Session";
import { AssetType, LibraryAsset, LibraryCommand, LibraryFilter, LibraryOrder, LibrarySnapshot } from "../sceneRules/library";
import { libraryCommand, PreparedLibraryUpload, sessionLibraryAccess, uploadLibraryAsset } from "../network/library";
import { prepareLibraryUpload } from "../helpers/libraryUpload";
import { BundledLibraryAsset, bundledServerSet } from "../helpers/serverSet";
import { useAssets } from "./AssetsContext";
import useSetting from "../hooks/useSetting";

export type LibraryExtension = "manager" | "new-scene" | "upload";
export type LibraryExtensionRequest = { extension: LibraryExtension; asset?: LibraryAsset | BundledLibraryAsset; files?: File[] };

function useLibraryStore(session: Session) {
  const serverSet = useMemo(bundledServerSet, []);
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(session.library);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [savedOrder, saveOrder] = useSetting<LibraryOrder | undefined>("library.order");
  const order: LibraryOrder = savedOrder === "newest" ? "newest" : "name";
  const [request, setRequest] = useState<LibraryExtensionRequest | null>(null);
  const { getAsset, putAsset } = useAssets();
  useEffect(() => {
    setSnapshot(session.library);
    session.on("library", setSnapshot);
    return () => { session.off("library", setSnapshot); };
  }, [session]);
  useEffect(() => { setSelection(ids => ids.filter(id => serverSet.some(asset => asset.id === id) || snapshot?.assets.some(asset => asset.id === id))); }, [snapshot, serverSet]);
  const command = useCallback((value: LibraryCommand) => libraryCommand(session, value), [session]);
  const uploadPrepared = useCallback((upload: PreparedLibraryUpload, onProgress?: (sent: number, total: number) => void) =>
    uploadLibraryAsset(sessionLibraryAccess(session), upload, putAsset, onProgress), [session, putAsset]);
  const upload = useCallback(async (file: File, type: AssetType, options: { import?: boolean; folderId?: string | null } = {}) => {
    const prepared = await prepareLibraryUpload(file, type);
    return uploadPrepared({ ...prepared, metadata: { ...prepared.metadata, ...options } });
  }, [uploadPrepared]);
  const fetchFile = useCallback(async (id: string) => {
    return getAsset(id);
  }, [getAsset]);
  return { snapshot, assets: snapshot?.assets || [], folders: snapshot?.folders || [], usage: snapshot?.usage,
    loading: snapshot === null, serverSet, filter, setFilter, search, setSearch, order, setOrder: saveOrder,
    selection, setSelection, command, upload, fetchFile,
    extensionRequest: request, openExtension: setRequest, closeExtension: () => setRequest(null) };
}

const LibraryContext = React.createContext<ReturnType<typeof useLibraryStore> | undefined>(undefined);
/** Room-scoped and mounted above all dock/manager/canvas consumers. */
export function LibraryProvider({ session, children }: { session: Session; children: React.ReactNode }) {
  const value = useLibraryStore(session);
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error("useLibrary must be used within a LibraryProvider");
  return context;
}
