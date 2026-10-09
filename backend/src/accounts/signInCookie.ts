import { requestIsHttps } from "../clientRequest";
import { Request, CookieOptions } from "express";

export const SIGN_IN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export function signInCookieOptions(request: Request): CookieOptions {
  return { httpOnly: true, sameSite: "lax", path: "/", secure: requestIsHttps(request, request.app.get("behindProxy") === true) };
}
export function lastingSignInCookieOptions(request: Request): CookieOptions {
  return { ...signInCookieOptions(request), maxAge: SIGN_IN_LIFETIME_MS };
}
