import { NextFunction, Request, Response } from "express";
import { pipeline } from "stream/promises";
import {
  AssetStore,
  isAssetId,
} from "../entities/AssetStore";
import JoinTokens from "../entities/JoinTokens";
import Controller, { Methods } from "./Controller";

/**
 * Download and existence check for immutable stored files:
 *
 *   PUT  /assets/:assetId   refused; uploads require a library reservation
 *   GET  /assets/:assetId   the bytes with the same headers
 *   HEAD /assets/:assetId   200 or 404
 *
 * Every request needs `Authorization: Bearer <join token>`.
 */
export default class AssetController extends Controller {
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

  constructor(private readonly store: AssetStore, private readonly joinTokens: JoinTokens) {
    super();
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
      // Reads still work with uploads off, but cannot make a foreign image placeable.
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
    res: Response
  ): Promise<void> {
    req.resume();
    res.status(403).json({ error: "Begin a library upload before sending files" });
  }
}
