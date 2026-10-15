import { AssetDefaults, AssetType } from "../sceneRules/library";
import { PreparedLibraryUpload } from "../network/library";
import { filenameGridSize, libraryDefaults } from "./library";
import { createThumbnail, getImageOutline, resizeImage } from "./image";
import blobToBuffer from "./blobToBuffer";
import { getGridSizeFromImage } from "./grid";

/** Browser image processing only; no hashes or client-issued file identities. */
export async function prepareLibraryUpload(file: File, type: AssetType, saved?: { name?: string; defaults?: AssetDefaults }): Promise<PreparedLibraryUpload> {
  const buffer = await blobToBuffer(file);
  const url = URL.createObjectURL(new Blob([buffer], { type: file.type }));
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
      image.src = url;
    });
    const size = saved?.defaults?.grid.size || filenameGridSize(file.name) || (type === "map" ? await getGridSizeFromImage(image) : undefined);
    const defaults = saved?.defaults || libraryDefaults(size);
    const files: PreparedLibraryUpload["files"] = { original: { file: buffer, mime: file.type, width: image.width, height: image.height } };
    const thumbnail = await createThumbnail(image, file.type);
    if (thumbnail) files.thumbnail = thumbnail;
    if (type === "map") {
      const resolutions = [{ role: "low", pixels: 30, quality: 0.5 }, { role: "medium", pixels: 70, quality: 0.6 },
        { role: "high", pixels: 140, quality: 0.7 }, { role: "ultra", pixels: 300, quality: 0.8 }] as const;
      for (const resolution of resolutions) {
        const width = defaults.grid.size.x * resolution.pixels, height = defaults.grid.size.y * resolution.pixels;
        if (image.width >= width && image.height >= height) {
          const resized = await resizeImage(image, Math.max(width, height), file.type, resolution.quality);
          if (resized) files[resolution.role] = resized;
        }
      }
    }
    const name = saved?.name || file.name.replace(/\.[^/.]+$/, "").trim().slice(0, 100) || "Image";
    return { files, metadata: { name, type, width: image.width, height: image.height, defaults, outline: getImageOutline(image) } };
  } finally { URL.revokeObjectURL(url); }
}
