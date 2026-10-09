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
  constructor(private readonly accounts: Accounts) { super(); }
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
    const result = typeof username === "string" && typeof password === "string"
      ? await this.accounts.signIn(username, password) : null;
    if (!result) {
      res.status(401).json({ error: "invalid_credentials", message: "Your username or password is incorrect." });
      return;
    }
    res.cookie("owlbear_sign_in", result.token, lastingSignInCookieOptions);
    res.json({ account: result.account });
  }
}
