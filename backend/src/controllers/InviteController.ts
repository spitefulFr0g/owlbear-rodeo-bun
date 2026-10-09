import express, { Request, Response, NextFunction, RequestHandler } from "express";
import { lastingSignInCookieOptions } from "../accounts/signInCookie";
import Accounts from "../accounts/Accounts";
import { requireAdministrator } from "../accounts/requireAdministrator";
import Controller, { Methods } from "./Controller";

const inviteJson: RequestHandler = (req, res, next) => {
  express.json()(req, res, error => {
    if (error) req.body = undefined;
    next();
  });
};

export default class InviteController extends Controller {
  path = "/api";
  constructor(private readonly accounts: Accounts) { super(); }
  private administrator = (req: Request, res: Response, next: NextFunction) => requireAdministrator(this.accounts)(req, res, next);
  protected routes = [
    { path: "/admin/accounts", method: Methods.GET, handler: (_req: Request, res: Response) => { res.json({ accounts: this.accounts.list() }); }, localMiddleware: [this.administrator] },
    { path: "/admin/invites", method: Methods.POST, handler: (_req: Request, res: Response) => { res.status(201).json(this.accounts.createInvite()); }, localMiddleware: [this.administrator] },
    { path: "/invites/:token", method: Methods.GET, handler: this.check.bind(this), localMiddleware: [] },
    { path: "/invites/:token", method: Methods.POST, handler: (req: Request, res: Response, next: NextFunction) => this.accept(req, res).catch(next), localMiddleware: [inviteJson] },
  ];

  private check(req: Request, res: Response): void {
    if (!this.accounts.inviteUsable(req.params.token)) {
      res.status(404).json({ error: "link_invalid", message: "This link is invalid or has expired." });
    } else res.json({});
  }

  private async accept(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body ?? {};
    const result = await this.accounts.acceptInvite(req.params.token, username, password);
    if (result.error !== undefined) {
      const errors = {
        link_invalid: [404, "This link is invalid or has expired."],
        username_length: [400, "Your username must be 3 to 32 characters long."],
        username_characters: [400, "Your username may contain only letters, digits, periods, underscores and hyphens."],
        password_too_short: [400, "Your password must be at least 8 characters long."],
        username_taken: [409, "That username is already taken."],
      } as const;
      const [status, message] = errors[result.error];
      res.status(status).json({ error: result.error, message });
      return;
    }
    res.cookie("owlbear_sign_in", result.token, lastingSignInCookieOptions(req));
    res.status(201).json({ account: result.account });
  }
}
