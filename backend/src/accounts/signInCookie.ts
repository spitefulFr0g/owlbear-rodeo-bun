import { CookieOptions } from "express";

export const SIGN_IN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const signInCookieOptions: CookieOptions = { httpOnly: true, sameSite: "lax", path: "/" };
export const lastingSignInCookieOptions: CookieOptions = { ...signInCookieOptions, maxAge: SIGN_IN_LIFETIME_MS };
