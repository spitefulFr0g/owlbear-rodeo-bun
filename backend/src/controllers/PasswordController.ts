import express, { Request, Response, NextFunction, RequestHandler } from "express";
import Accounts from "../accounts/Accounts";
import { requireAdministrator } from "../accounts/requireAdministrator";
import { lastingSignInCookieOptions } from "../accounts/signInCookie";
import Controller, { Methods } from "./Controller";

const passwordJson: RequestHandler = (req, res, next) => {
  express.json()(req, res, error => {
    if (error) req.body = undefined;
    next();
  });
};

export default class PasswordController extends Controller {
  path = "/api";
  constructor(private readonly accounts: Accounts) { super(); }
  private administrator = (req: Request, res: Response, next: NextFunction) => requireAdministrator(this.accounts)(req, res, next);
  protected routes = [
    { path: "/account/password", method: Methods.POST, handler: (req: Request, res: Response, next: NextFunction) => this.change(req, res).catch(next), localMiddleware: [passwordJson] },
    { path: "/admin/accounts/:id/reset-link", method: Methods.POST, handler: this.create.bind(this), localMiddleware: [this.administrator] },
    { path: "/resets/:token", method: Methods.GET, handler: this.check.bind(this), localMiddleware: [] },
    { path: "/resets/:token", method: Methods.POST, handler: (req: Request, res: Response, next: NextFunction) => this.accept(req, res).catch(next), localMiddleware: [passwordJson] },
  ];

  private create(req: Request, res: Response): void {
    const result = this.accounts.createResetLink(req.params.id);
    if (!result) res.status(404).json({ error: "account_not_found", message: "This account was not found." });
    else res.status(201).json(result);
  }

  private async change(req: Request, res: Response): Promise<void> {
    this.accounts.resolveAccount(req, token => res.cookie("owlbear_sign_in", token, lastingSignInCookieOptions));
    const result = await this.accounts.changePassword(req, req.body?.currentPassword, req.body?.newPassword);
    if (result.error !== undefined) this.error(res, result.error);
    else res.status(204).end();
  }

  private async accept(req: Request, res: Response): Promise<void> {
    const result = await this.accounts.acceptReset(req.params.token, req.body?.password);
    if (result.error !== undefined) {
      this.error(res, result.error);
      return;
    }
    res.cookie("owlbear_sign_in", result.token, lastingSignInCookieOptions);
    res.json({ account: result.account });
  }

  private error(res: Response, error: "link_invalid" | "password_too_short" | "wrong_password" | "not_signed_in"): void {
    const errors = {
      link_invalid: [404, "This link is invalid or has expired."],
      password_too_short: [400, "Your password must be at least 8 characters long."],
      wrong_password: [403, "Your current password is incorrect."],
      not_signed_in: [401, "Sign in to continue."],
    } as const;
    const [status, message] = errors[error];
    res.status(status).json({ error, message });
  }

  private check(req: Request, res: Response): void {
    const account = this.accounts.resetAccount(req.params.token);
    if (!account) res.status(404).json({ error: "link_invalid", message: "This link is invalid or has expired." });
    else res.json({ username: account.username });
  }
}
