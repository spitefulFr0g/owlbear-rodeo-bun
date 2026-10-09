import { NextFunction, Request, Response } from "express";
import { pipeline } from "stream/promises";
import {
  AssetExistsError,
  AssetInfo,
  AssetStore,
  AssetTooLargeError,
  isAssetId,
} from "../entities/AssetStore";
import JoinTokens from "../entities/JoinTokens";
import Controller, { Methods } from "./Controller";

/**
 * Upload, download and existence check for assets:
 *
 *   PUT  /assets/:assetId   body is the raw bytes, Content-Type is the mime
 *                           type, X-Asset-* headers carry the rest
 *   GET  /assets/:assetId   the bytes with the same headers
 *   HEAD /assets/:assetId   200 or 404
 *
 * Every request needs `Authorization: Bearer <join token>`.
 */
export default class AssetController extends Controller {
  store: AssetStore;

  joinTokens: JoinTokens;

  maxBytes: number;

  path = "/assets";

  routes = [
    {
      path: "/:assetId",
      // Express answers HEAD with the GET route
      method: Methods.GET,
      handler: this.handleDownload.bind(this),
      localMiddleware: [this.requireJoinToken.bind(this)],
    },
    {
      path: "/:assetId",
      method: Methods.PUT,
      handler: this.handleUpload.bind(this),
      localMiddleware: [],
    },
  ];

  constructor(store: AssetStore, joinTokens: JoinTokens, maxBytes: number) {
    super();
    this.store = store;
    this.joinTokens = joinTokens;
    this.maxBytes = maxBytes;
  }

  // Controller mounts middleware on the path, so this covers every method
  requireJoinToken(req: Request, res: Response, next: NextFunction): void {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token || !this.joinTokens.verify(token)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.sendStatus(401);
      return;
    }
    if (req.method === "PUT" && !this.joinTokens.canUpload(token)) {
      req.resume();
      res.sendStatus(403);
      return;
    }
    next();
  }

  async handleDownload(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { assetId } = req.params;
      const asset = isAssetId(assetId)
        ? await this.store.get(assetId)
        : undefined;
      if (!asset) {
        res.sendStatus(404);
        return;
      }
      const { record } = asset;
      res.status(200).set({
        "Content-Type": record.mime,
        "Content-Length": String(record.size),
        "X-Asset-Width": String(record.width),
        "X-Asset-Height": String(record.height),
        "X-Asset-Owner": record.owner,
        // Lets a frontend on another origin (the dev server) read them
        "Access-Control-Expose-Headers":
          "X-Asset-Width, X-Asset-Height, X-Asset-Owner",
        // An id never changes what it points to
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${record.hash}"`,
        // Uploads are untrusted, so never let one run as a page
        "Content-Security-Policy": "default-src 'none'; sandbox",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      await pipeline(asset.open(), res);
    } catch (error) {
      if (res.headersSent) {
        console.error("ASSET_DOWNLOAD_ERROR", error);
        res.destroy();
      } else {
        next(error);
      }
    }
  }

  async handleUpload(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // A refused upload is answered straight away. The rest of the body is
    // still read and thrown away, because a browser that is cut off mid
    // upload reports a network error instead of the status.
    const refuse = (status: number) => {
      req.resume();
      res.sendStatus(status);
    };

    try {
      const { assetId } = req.params;
      const info = parseAssetInfo(req);
      if (!isAssetId(assetId) || !info) {
        refuse(400);
        return;
      }
      if (Number(req.headers["content-length"]) > this.maxBytes) {
        refuse(413);
        return;
      }
      const record = await this.store.put(
        assetId,
        info,
        // Keep the connection open when the store gives up on the body
        req.iterator({ destroyOnReturn: false })
      );
      res.status(201).json({ id: record.id, hash: record.hash });
    } catch (error) {
      if (error instanceof AssetExistsError) {
        refuse(409);
      } else if (error instanceof AssetTooLargeError) {
        refuse(413);
      } else {
        next(error);
      }
    }
  }
}

function parseAssetInfo(req: Request): AssetInfo | undefined {
  const mime = (req.headers["content-type"] ?? "").split(";")[0].trim();
  const width = Number(req.headers["x-asset-width"]);
  const height = Number(req.headers["x-asset-height"]);
  const owner = req.headers["x-asset-owner"];
  if (
    // Assets saved by old versions of the app have no mime type, and the
    // frontend sends those as application/octet-stream
    !/^(image\/[\w.+-]+|application\/octet-stream)$/.test(mime) ||
    !isDimension(width) ||
    !isDimension(height) ||
    typeof owner !== "string" ||
    !/^[\w-]{1,64}$/.test(owner)
  ) {
    return undefined;
  }
  return { mime, width, height, owner };
}

function isDimension(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
