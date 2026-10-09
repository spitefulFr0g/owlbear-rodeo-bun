import AttemptLimiter from "../AttemptLimiter";
import express, { Request, Response, RequestHandler, NextFunction } from "express";
import { lastingSignInCookieOptions, signInCookieOptions } from "../accounts/signInCookie";
import Accounts from "../accounts/Accounts";
import Controller, { Methods } from "./Controller";

const signInJson: RequestHandler = (req, res, next) => {
  express.json()(req, res, error => {
    if (error) {
      res.status(401).json({ error: "invalid_credentials", message: "Your username or password is incorrect." });
      return;
    }
    next();
  });
};

export default class SignInController extends Controller {
  path = "/api";
  constructor(private readonly accounts: Accounts, private readonly attempts: AttemptLimiter) { super(); }
  protected routes = [
    { path: "/sign-out", method: Methods.POST, handler: this.signOut.bind(this), localMiddleware: [] },
    { path: "/sign-in", method: Methods.POST, handler: (req: Request, res: Response, next: NextFunction) => this.signIn(req, res).catch(next), localMiddleware: [signInJson] },
  ];

  private signOut(req: Request, res: Response): void {
    this.accounts.signOut(req);
    res.clearCookie("owlbear_sign_in", signInCookieOptions);
    res.status(204).end();
  }

  private async signIn(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body ?? {};
    const nameKey = `sign-in:name:${typeof username === "string" ? username.toLowerCase() : ""}`;
    const keys = [nameKey, `sign-in:address:${req.socket.remoteAddress}`];
    const retryAfterSeconds = this.attempts.retryAfterSeconds(keys);
    if (retryAfterSeconds) {
      res.status(429).json({ error: "too_many_attempts", message: "Too many incorrect passwords; please wait before trying again.", retryAfterSeconds });
      return;
    }
    const result = typeof username === "string" && typeof password === "string"
      ? await this.accounts.signIn(username, password) : null;
    if (!result) {
      this.attempts.wrong(keys);
      res.status(401).json({ error: "invalid_credentials", message: "Your username or password is incorrect." });
      return;
    }
    this.attempts.reset(nameKey);
    res.cookie("owlbear_sign_in", result.token, lastingSignInCookieOptions);
    res.json({ account: result.account });
  }
}
