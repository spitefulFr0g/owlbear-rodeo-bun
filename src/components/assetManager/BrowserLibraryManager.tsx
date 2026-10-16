import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Box, Button, Text } from "theme-ui";
import AssetManager from "./AssetManager";
import FloatingWindow from "../FloatingWindow";
import { useDatabase } from "../../contexts/DatabaseContext";
import { useLibrary } from "../../contexts/LibraryContext";
import { useRole } from "../../contexts/RoomContext";
import { useServerStatus } from "../../contexts/ServerStatusContext";
import { browserImportRecord, importedAsset, rememberedImports, rememberImports } from "../../helpers/library";
import { prepareLibraryUpload } from "../../helpers/libraryUpload";
import { Map as BrowserMap } from "../../types/Map";
import { Token } from "../../types/Token";
import { Group } from "../../types/Group";
import { Asset } from "../../types/Asset";

/** Reads legacy metadata and original bytes only; never changes the browser library. */
export default function BrowserLibraryManager() {
  const { database } = useDatabase();
  const role = useRole();
  const { account } = useServerStatus();
  const library = useLibrary();
  const [open, setOpen] = useState(false);
  const request = library.extensionRequest;
  useEffect(() => {
    if (request?.extension !== "import") return;
    if (role === "gm") setOpen(true);
    library.closeExtension();
    // The request is consumed once, like the manager extension.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, role]);
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState("");
  const [imported, setImported] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState("");
  const records = useLiveQuery(async () => {
    // Temporary bridge until the import UI is removed by task I.
    if (!database || role !== "gm" || !database.tables.some(table => table.name === "maps")) return [];
    const [maps, tokens, mapGroups, tokenGroups] = await Promise.all([
      database.table<BrowserMap>("maps").toArray(), database.table<Token>("tokens").toArray(),
      database.table("groups").get("maps"), database.table("groups").get("tokens"),
    ]);
    return [...maps.map(record => browserImportRecord(record, (mapGroups?.items || []) as Group[])),
      ...tokens.map(record => browserImportRecord(record, (tokenGroups?.items || []) as Group[]))]
      .filter((record): record is NonNullable<typeof record> => !!record);
  }, [database, role]);

  async function start() {
    if (busy.current || !database || !records?.length || !account || role !== "gm") return;
    busy.current = true;
    setRunning(true); setProgress(0); setImported([]); setSkipped([]); setError("");
    const folders = new Map(library.folders.filter(folder => folder.library.kind === "account" && folder.library.id === account.id)
      .map(folder => [folder.name, folder.id]));
    const marks = rememberedImports(account.id);
    try {
      for (let index = 0; index < records.length; index++) {
        const record = records[index];
        setCurrent(record.name);
        if (importedAsset(marks, library.assets, account.id, record.originalId)) {
          setSkipped(items => [...items, `${record.name}: Already in your account library.`]);
          setProgress((index + 1) / records.length);
          continue;
        }
        let prepared;
        try {
          const original = await database.table<Asset>("assets").get(record.originalId);
          if (!original) throw new Error("Original image is missing from this browser.");
          prepared = await prepareLibraryUpload(new File([original.file], record.name, { type: original.mime }), record.type, record);
        } catch (failure) {
          setSkipped(items => [...items, `${record.name}: ${failure instanceof Error ? failure.message : "Unable to read image."}`]);
          setProgress((index + 1) / records.length);
          continue;
        }
        let folderId: string | null = null;
        if (record.folderName) {
          folderId = folders.get(record.folderName) || null;
          if (!folderId) {
            const reply = await library.command({ action: "folder-create", library: "account", name: record.folderName });
            if (!reply.id) throw new Error("The library did not return the new folder.");
            folderId = reply.id;
            folders.set(record.folderName, folderId);
          }
        }
        try {
          const result = await library.uploadPrepared({ ...prepared, metadata: { ...prepared.metadata, import: true, folderId } },
            (sent, total) => setProgress((index + sent / total) / records.length));
          marks[record.originalId] = result.asset.id;
          rememberImports(account.id, marks);
          if (result.duplicate) setSkipped(items => [...items, `${record.name}: Already in your account library.`]);
          else setImported(items => [...items, record.name]);
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : "Unable to import image.";
          // The server owns its configured size cap. Other refusals stop safely,
          // including quotas, count caps and a lost connection.
          if (message === "Invalid file size or media type" || message === "File exceeds declared size") {
            setSkipped(items => [...items, `${record.name}: Image is too large or its media type is unsupported.`]);
          } else throw new Error(`${record.name}: ${message}`);
        }
        setProgress((index + 1) / records.length);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to import the browser library.");
    } finally { busy.current = false; setRunning(false); setCurrent(""); }
  }

  return <>
    <AssetManager actions={role === "gm" && !!records?.length && <Button variant="secondary" sx={{ px: 2, py: 1, fontSize: 1 }} onClick={() => library.openExtension({ extension: "import" })}>Import browser library</Button>} />
    {open && role === "gm" && <FloatingWindow title="Import browser library" width={440} height={420} onClose={() => { if (!running) setOpen(false); }}>
      <Box sx={{ p: 3, overflowY: "auto", flexGrow: 1 }}>
        <Text as="p">Import every uploaded map and token into your account library. Groups become folders. Your browser library stays untouched. Images already imported are skipped.</Text>
        <progress aria-label="Browser library import progress" max={1} value={progress} style={{ width: "100%" }} />
        <Text as="p" role="status">{running ? `Importing ${current}…` : `${imported.length} imported, ${skipped.length} skipped.`}</Text>
        {error && <Text as="p" role="alert">Import stopped. {error} Imported images have been kept; you can run it again.</Text>}
        {!!imported.length && <><Text as="p">Imported</Text><ul>{imported.map((name, index) => <li key={index}>{name}</li>)}</ul></>}
        {!!skipped.length && <><Text as="p">Skipped</Text><ul>{skipped.map((name, index) => <li key={index}>{name}</li>)}</ul></>}
        <Button disabled={running || library.loading} onClick={start}>{running ? "Importing…" : "Import all"}</Button>
        {!running && <Button variant="secondary" sx={{ ml: 2 }} onClick={() => setOpen(false)}>Close</Button>}
      </Box>
    </FloatingWindow>}
  </>;
}
