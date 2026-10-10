import express, { Request, Response, RequestHandler, NextFunction } from "express";
import { lastingSignInCookieOptions } from "../accounts/signInCookie";
import Accounts from "../accounts/Accounts";
import Controller, { Methods } from "./Controller";

const setupJson: RequestHandler = (req, res, next) => {
  express.json()(req, res, error => {
    if (error) {
      res.status(400).json({ error: "username_length", message: "Send a JSON object with a username of 3 to 32 characters and a password." });
      return;
    }
    next();
  });
};

export default class SetupController extends Controller {
  path = "/api";
  constructor(private readonly accounts: Accounts) { super(); }
  protected routes = [
    { path: "/status", method: Methods.GET, handler: this.status.bind(this), localMiddleware: [] },
    { path: "/setup", method: Methods.POST, handler: (req: Request, res: Response, next: NextFunction) => this.setup(req, res).catch(next), localMiddleware: [setupJson] },
  ];

  private status(req: Request, res: Response): void {
    res.json({ setup: this.accounts.setupState(), account: this.accounts.resolveAccount(req, token => res.cookie("owlbear_sign_in", token, lastingSignInCookieOptions(req))) });
  }

  private async setup(req: Request, res: Response): Promise<void> {
    if (this.accounts.setupState() === "closed") {
      res.status(409).json({ error: "setup_closed", message: "An administrator already exists, so setup is closed." });
      return;
    }
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || username.length < 3 || username.length > 32) {
      res.status(400).json({ error: "username_length", message: "Your username must be 3 to 32 characters long." });
      return;
    }
    if (!/^[A-Za-z0-9._-]+$/.test(username)) {
      res.status(400).json({ error: "username_characters", message: "Your username may contain only letters, digits, periods, underscores and hyphens." });
      return;
    }
    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "password_too_short", message: "Your password must be at least 8 characters long." });
      return;
    }
    const result = await this.accounts.setup(username, password);
    if (result === "username_taken") {
      res.status(409).json({ error: "username_taken", message: "That username is already taken; choose another." });
      return;
    }
    if (!result) {
      res.status(409).json({ error: "setup_closed", message: "An administrator already exists, so setup is closed." });
      return;
    }
    console.log(`Administrator created: ${result.account.username}`);
    res.cookie("owlbear_sign_in", result.token, lastingSignInCookieOptions(req));
    res.status(201).json({ account: result.account });
  }
}
