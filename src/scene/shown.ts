import {
  applyChange,
  Change,
  ImageItem,
  Item,
  layers,
  Scene,
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

/** The scene's Image items in the order they are drawn, bottom first */
export function imagesInOrder(scene: Scene): ImageItem[] {
  const images: ImageItem[] = [];
  for (const item of Object.values(scene.items))
    if (item.kind === "image") images.push(item);
  return images.sort(
    (a, b) =>
      layers.indexOf(a.layer) - layers.indexOf(b.layer) || a.order - b.order
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
