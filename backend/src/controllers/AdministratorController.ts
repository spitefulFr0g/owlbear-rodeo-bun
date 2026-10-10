import express, { Router, RequestHandler } from "express";
import Accounts from "../accounts/Accounts";
import { requireAdministrator } from "../accounts/requireAdministrator";
import GameRepository from "../entities/GameRepository";

const administratorBody: RequestHandler = (req, res, next) => {
  express.json()(req, res, error => {
    if (error || typeof req.body?.administrator !== "boolean") {
      res.status(400).json({ error: "administrator_invalid", message: "Choose whether the account is an administrator." });
      return;
    }
    next();
  });
};

export default class AdministratorController {
  constructor(private readonly accounts: Accounts, private readonly rooms: GameRepository) {}

  setRoutes(): Router {
    const router = Router();
    router.post("/admin/accounts/:id/administrator", requireAdministrator(this.accounts), administratorBody, (req, res) => {
      const result = this.accounts.setAdministrator(req.params.id, req.body.administrator);
      if (result.error) res.status(result.error === "last_administrator" ? 409 : 404).json({ error: result.error, message: result.error === "last_administrator" ? "The last administrator must keep the administrator mark." : "That account does not exist." });
      else res.json(result);
    });
    router.delete("/admin/accounts/:id", requireAdministrator(this.accounts), (req, res) => {
      const caller = this.accounts.resolveAccount(req)!;
      const result = this.accounts.removeAccount(req.params.id, caller.id);
      if (result.error) {
        const errors = {
          account_not_found: [404, "That account does not exist."],
          cannot_remove_self: [409, "You cannot remove your own account."],
          last_administrator: [409, "The last administrator cannot be removed."],
        } as const;
        const [status, message] = errors[result.error];
        res.status(status).json({ error: result.error, message });
        return;
      }
      for (const room of Object.values(this.rooms.games)) {
        if (room.gmAccountId === req.params.id) room.gmAccountId = caller.id;
      }
      res.sendStatus(204);
    });
    return router;
  }
}
