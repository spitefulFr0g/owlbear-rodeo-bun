import { extname } from "path";
import { NextFunction, Request, RequestHandler, Response } from "express";

/** Maps a URL path such as `/static/js/main.js` to a file on disk or in the executable. */
export type AssetMap = Record<string, string>;

export interface ResolvedAsset {
  filePath: string;
  /** File extension used to pick the Content-Type */
  type: string;
  /** Content-hashed file that can be cached forever */
  immutable: boolean;
}

export function resolveAsset(
  pathname: string,
  assets: AssetMap
): ResolvedAsset | undefined {
  const filePath = assets[pathname];
  if (filePath) {
    return {
      filePath,
      type: extname(pathname),
      immutable: pathname.startsWith("/static/"),
    };
  }
  // Anything without a file extension is a client-side route
  const index = assets["/index.html"];
  if (index && extname(pathname) === "") {
    return { filePath: index, type: ".html", immutable: false };
  }
  return undefined;
}

/** Serves the embedded frontend build, falling back to index.html for app routes. */
export function frontendHandler(assets: AssetMap): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    const asset = resolveAsset(req.path, assets);
    if (!asset) {
      next();
      return;
    }
    try {
      const body = Buffer.from(await Bun.file(asset.filePath).arrayBuffer());
      res.type(asset.type);
      res.setHeader(
        "Cache-Control",
        asset.immutable ? "public, max-age=31536000, immutable" : "no-cache"
      );
      res.send(body);
    } catch (error) {
      next(error);
    }
  };
}
