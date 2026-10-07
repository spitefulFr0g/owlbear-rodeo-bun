import { Asset } from "../types/Asset";

/**
 * Client for the server's asset store. Assets are uploaded by their owner and
 * downloaded by everyone else in the game over plain HTTP.
 */

// Give up on a request when no bytes have moved for this long
const IDLE_TIMEOUT = 30000;

// Assets saved by old versions of the app have no mime type
const UNKNOWN_MIME = "application/octet-stream";

/** Where to find the store and the join token that proves we are in a game */
export type AssetStoreAccess = {
  url: string;
  token: string;
};

export type AssetProgressHandler = (loaded: number, total: number) => void;

export class AssetRequestError extends Error {
  /** HTTP status, or 0 when the server could not be reached or timed out */
  status: number;

  constructor(status: number) {
    super(
      status === 0
        ? "Unable to reach the asset store"
        : `Asset store responded with ${status}`
    );
    this.status = status;
    // Keeps instanceof working when classes are compiled down to ES5
    Object.setPrototypeOf(this, AssetRequestError.prototype);
  }
}

type RequestOptions = {
  method: "GET" | "HEAD" | "PUT";
  headers?: Record<string, string>;
  body?: Uint8Array;
  onDownloadProgress?: AssetProgressHandler;
};

// XMLHttpRequest instead of fetch as it reports progress in both directions
function request(
  { url, token }: AssetStoreAccess,
  assetId: string,
  { method, headers = {}, body, onDownloadProgress }: RequestOptions
): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${url}/assets/${encodeURIComponent(assetId)}`);
    xhr.responseType = "arraybuffer";
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    for (let [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }

    let idleTimeout: ReturnType<typeof setTimeout>;
    function resetIdleTimeout() {
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => xhr.abort(), IDLE_TIMEOUT);
    }
    function fail() {
      clearTimeout(idleTimeout);
      reject(new AssetRequestError(0));
    }

    xhr.upload.onprogress = resetIdleTimeout;
    xhr.onprogress = (event) => {
      resetIdleTimeout();
      if (onDownloadProgress && event.lengthComputable) {
        onDownloadProgress(event.loaded, event.total);
      }
    };
    xhr.onload = () => {
      clearTimeout(idleTimeout);
      resolve(xhr);
    };
    xhr.onerror = fail;
    xhr.onabort = fail;

    resetIdleTimeout();
    xhr.send(body);
  });
}

/** Does the server already have this asset */
export async function hasAsset(
  access: AssetStoreAccess,
  assetId: string
): Promise<boolean> {
  const xhr = await request(access, assetId, { method: "HEAD" });
  if (xhr.status === 200) {
    return true;
  }
  if (xhr.status === 404) {
    return false;
  }
  throw new AssetRequestError(xhr.status);
}

export async function uploadAsset(
  access: AssetStoreAccess,
  asset: Asset
): Promise<void> {
  const xhr = await request(access, asset.id, {
    method: "PUT",
    headers: {
      "Content-Type": asset.mime || UNKNOWN_MIME,
      "X-Asset-Width": String(asset.width),
      "X-Asset-Height": String(asset.height),
      "X-Asset-Owner": asset.owner,
    },
    body: asset.file,
  });
  // The store is write-once, a conflict means the asset is already there
  if (xhr.status !== 201 && xhr.status !== 409) {
    throw new AssetRequestError(xhr.status);
  }
}

export async function downloadAsset(
  access: AssetStoreAccess,
  assetId: string,
  onProgress?: AssetProgressHandler
): Promise<Asset> {
  const xhr = await request(access, assetId, {
    method: "GET",
    onDownloadProgress: onProgress,
  });
  if (xhr.status !== 200) {
    throw new AssetRequestError(xhr.status);
  }
  const mime = (xhr.getResponseHeader("Content-Type") || "")
    .split(";")[0]
    .trim();
  return {
    id: assetId,
    file: new Uint8Array(xhr.response),
    width: Number(xhr.getResponseHeader("X-Asset-Width")),
    height: Number(xhr.getResponseHeader("X-Asset-Height")),
    owner: xhr.getResponseHeader("X-Asset-Owner") || "",
    mime: mime === UNKNOWN_MIME ? "" : mime,
  };
}
