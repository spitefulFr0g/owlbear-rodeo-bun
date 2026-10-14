import { v4 as uuid } from "uuid";
import Case from "case";

import blobToBuffer from "./blobToBuffer";
import { createThumbnail, getImageOutline } from "./image";

import { Token, FileToken, TokenCategory } from "../types/Token";
import { Asset } from "../types/Asset";

export async function createTokenFromFile(
  file: File,
  userId: string
): Promise<{ token: Token; assets: Asset[] }> {
  if (!file) {
    return Promise.reject();
  }
  let name = "Unknown Token";
  let category: TokenCategory = "character";
  let defaultSize = 1;
  if (file.name) {
    name = file.name.toLowerCase();
    if (name.matchAll) {
      // Match against a regex to find the grid size in the file name
      // e.g. Cave 22x23 will return [["22x22", "22", "x", "23"]]
      const sizeMatches = [...name.matchAll(/(\d+) ?(x|X) ?(\d+)/g)];
      for (let match of sizeMatches) {
        const matchX = parseInt(match[1]);
        const matchY = parseInt(match[3]);
        if (
          !isNaN(matchX) &&
          !isNaN(matchY) &&
          matchX < 256 // Add check to test match isn't resolution
        ) {
          defaultSize = matchX;
        }
      }
    }
    // Match only the category e.g mount and not mountain
    if (/(\b|_)prop(\b|_)/.test(name)) {
      category = "prop";
      name = name.replace(/(\b|_)prop(\b|_)/, "");
    } else if (/(\b|_)mount(\b|_)/.test(name)) {
      category = "vehicle";
      name = name.replace(/(\b|_)mount(\b|_)/, "");
    } else if (/(\b|_)attachment(\b|_)/.test(name)) {
      category = "attachment";
      name = name.replace(/(\b|_)attachment(\b|_)/, "");
    }
    // Remove file extension
    name = name.replace(/\.[^/.]+$/, "");
    // Removed grid size expression
    name = name.replace(/(\[ ?|\( ?)?\d+ ?(x|X) ?\d+( ?\]| ?\))?/, "");
    // Clean string
    name = name.replace(/ +/g, " ");
    name = name.trim();
    // Capitalize and remove underscores
    name = Case.capital(name);
  }
  let image = new Image();
  const buffer = await blobToBuffer(file);

  // Copy file to avoid permissions issues
  const blob = new Blob([buffer]);
  // Create and load the image temporarily to get its dimensions
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    image.onload = async function () {
      let assets: Asset[] = [];
      const thumbnailImage = await createThumbnail(image, file.type);
      const thumbnailId = uuid();
      if (thumbnailImage) {
        const thumbnail = { ...thumbnailImage, id: thumbnailId, owner: userId };
        assets.push(thumbnail);
      }

      const fileAsset = {
        id: uuid(),
        file: buffer,
        width: image.width,
        height: image.height,
        mime: file.type,
        owner: userId,
      };
      assets.push(fileAsset);

      const outline = getImageOutline(image);

      const token: FileToken = {
        name,
        defaultSize,
        thumbnail: thumbnailId,
        file: fileAsset.id,
        id: uuid(),
        type: "file",
        created: Date.now(),
        lastModified: Date.now(),
        owner: userId,
        defaultCategory: category,
        defaultLabel: "",
        hideInSidebar: false,
        width: image.width,
        height: image.height,
        outline,
      };

      URL.revokeObjectURL(url);
      resolve({ token, assets });
    };
    image.onerror = reject;
    image.src = url;
  });
}
