import { RequestHandler } from "express";
import { isOriginAllowed } from "../origin";

export function apiOrigin(allowOrigin: RegExp | null): RequestHandler {
  return (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !isOriginAllowed(req.headers.origin, req.headers.host, allowOrigin)) {
      res.status(403).json({ error: "origin_not_allowed", message: "This request came from an origin that is not allowed." });
      return;
    }
    next();
  };
}
