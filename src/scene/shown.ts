import {
  applyChange,
  Batch,
  Change,
  ImageItem,
  Item,
  layers,
  Scene,
  SceneGrid,
  topOrder,
} from "../sceneRules";

/** What the server sends the other connections when a batch is applied */
export type RelayedChanges = { sceneId: string; changes: Change[] };

/** What the server sends back to the connection that sent a batch */
export type BatchAnswer = {
  batchId: string;
  sceneId: string;
  applied: Change[];
  refused: { id: string; item: Item | null }[];
};

function withChanges(scene: Scene, changes: Change[]): Scene {
  return changes.reduce(
    (current, change) => applyChange(current, change).scene,
    scene
  );
}

/** The scene once changes made by another connection have arrived */
export function afterChanges(
  scene: Scene | null,
  relayed: RelayedChanges
): Scene | null {
  if (!scene || scene.id !== relayed.sceneId) return scene;
  return withChanges(scene, relayed.changes);
}

/** The scene once the server has answered a batch this connection sent */
export function afterAnswer(
  scene: Scene | null,
  answer: BatchAnswer
): Scene | null {
  if (!scene || scene.id !== answer.sceneId) return scene;
  const items = { ...withChanges(scene, answer.applied).items };
  for (const { id, item } of answer.refused) {
    // An id may be any short string, even one an object already answers to
    if (item)
      Object.defineProperty(items, id, {
        value: item,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    else delete items[id];
  }
  return { ...scene, items };
}

/** What the server sends everyone viewing a scene when the GM changes its grid */
export type GridChange = { sceneId: string; grid: SceneGrid };

/** The scene once the server has accepted a change to its grid */
export function afterGrid(scene: Scene | null, change: GridChange): Scene | null {
  if (!scene || scene.id !== change.sceneId) return scene;
  return { ...scene, grid: change.grid };
}

/** A change with the order the server will give it, so it shows where it will land */
function withServerOrder(scene: Scene, change: Change): Change {
  if (change.type === "add") {
    const order = topOrder(scene, change.item.layer);
    return { type: "add", item: { ...change.item, order } };
  }
  if (change.type !== "update") return change;
  const item = Object.prototype.hasOwnProperty.call(scene.items, change.id)
    ? scene.items[change.id]
    : undefined;
  const raised =
    change.fields.layer !== undefined ||
    (change.fields.position !== undefined &&
      item?.kind === "image" &&
      item.layer !== "map");
  if (!item || !raised) return change;
  // Only the server's own changes carry an order, so the type has no room for it
  const fields = {
    ...change.fields,
    order: topOrder(scene, change.fields.layer || item.layer),
  };
  return { ...change, fields };
}

/**
 * What the store shows: the server's scene with this connection's unconfirmed
 * batches on top, in the order they were made. A change that no longer fits,
 * such as an update to an item the server has since deleted, is skipped.
 */
export function shownScene(
  server: Scene | null,
  unconfirmed: Batch[]
): Scene | null {
  if (!server) return null;
  let shown = server;
  for (const batch of unconfirmed) {
    if (batch.sceneId !== server.id) continue;
    for (const change of batch.changes)
      shown = applyChange(shown, withServerOrder(shown, change)).scene;
  }
  return shown;
}

/**
 * The scene's Image items in the order they are drawn, bottom first. The
 * item named by `raised`, one being dragged, draws on top of its layer.
 */
export function imagesInOrder(scene: Scene, raised?: string): ImageItem[] {
  const images: ImageItem[] = [];
  for (const item of Object.values(scene.items))
    if (item.kind === "image") images.push(item);
  return images.sort(
    (a, b) =>
      layers.indexOf(a.layer) - layers.indexOf(b.layer) ||
      Number(a.id === raised) - Number(b.id === raised) ||
      a.order - b.order
  );
}

/** The stored files an Image item names */
export function imageFiles(item: ImageItem): string[] {
  const image = item.image;
  if (image.type !== "file") return [];
  const files = [image.file];
  if (image.thumbnail) files.push(image.thumbnail);
  for (const file of Object.values(image.resolutions || {}))
    if (file) files.push(file);
  return files;
}
