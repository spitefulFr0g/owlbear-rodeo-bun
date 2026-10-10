import { RequestHandler } from "express";
import Accounts from "./Accounts";
import { AssetMap, resolveAsset } from "../frontend";

export function setupLock(accounts: Accounts, frontendAssets: AssetMap): RequestHandler {
  return (req, res, next) => {
    if (accounts.hasAdministrator() ||
      (req.method === "GET" && (req.path === "/health" || req.path === "/api/status")) ||
      (req.method === "POST" && req.path === "/api/setup")) {
      next();
      return;
    }
    let pathname = req.path;
    try { pathname = decodeURIComponent(pathname); } catch { /* Refuse malformed paths while locked. */ }
    if ((req.method === "GET" || req.method === "HEAD") &&
      !/^\/(api|assets)(\/|$)/i.test(pathname) && resolveAsset(pathname, frontendAssets)) {
      next();
      return;
    }
    res.status(403).json({ error: "setup_required", message: "Create the first administrator before using this server." });
  };
}
