import { RequestHandler } from "express";
import Accounts from "./Accounts";
import { lastingSignInCookieOptions } from "./signInCookie";

export function requireAdministrator(accounts: Accounts): RequestHandler {
  return (req, res, next) => {
    const account = accounts.resolveAccount(req, token => res.cookie("owlbear_sign_in", token, lastingSignInCookieOptions(req)));
    if (!account) {
      res.status(401).json({ error: "not_signed_in", message: "Sign in to continue." });
    } else if (!account.administrator) {
      res.status(403).json({ error: "not_administrator", message: "Only an administrator can do this." });
    } else next();
  };
}
