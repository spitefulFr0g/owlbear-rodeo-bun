import express, { Router, RequestHandler } from "express";
import { randomInt } from "crypto";
import Accounts from "../accounts/Accounts";
import { lastingSignInCookieOptions } from "../accounts/signInCookie";
import { OwlbearDatabase } from "../database";
import GameRepository from "../entities/GameRepository";
import Auth from "../entities/Auth";

const roomName: RequestHandler = (req, res, next) => {
  express.json()(req, res, error => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (error || name.length < 1 || name.length > 64) {
      res.status(400).json({ error: "room_name_invalid", message: "Give the room a name from 1 to 64 characters." });
      return;
    }
    req.body.name = name;
    next();
  });
};

export interface Room { id: string; name: string; hasPassword: boolean; sizeBytes: number }

export default class RoomController {
  constructor(private readonly accounts: Accounts, private readonly database: OwlbearDatabase, private readonly rooms: GameRepository, private readonly renamed: (id: string, name: string) => void, private readonly deleteRoom: (id: string) => Promise<void>) {}

  setRoutes(): Router {
    const router = Router();
    router.use("/rooms", (req, res, next) => {
      const account = this.accounts.resolveAccount(req, token => res.cookie("owlbear_sign_in", token, lastingSignInCookieOptions(req)));
      if (!account) {
        res.status(401).json({ error: "not_signed_in", message: "Sign in to manage your rooms." });
        return;
      }
      res.locals.account = account;
      next();
    });
    router.get("/rooms", (_req, res) => {
      res.json({ rooms: this.database.roomsForGM(res.locals.account.id).map(room => ({ id: room.id, name: room.name, hasPassword: !!room.hasPassword, sizeBytes: this.database.roomSizeBytes(room.id) })) });
    });
    router.post("/rooms", roomName, async (req, res, next) => {
      try {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let id: string;
        do { id = Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join(""); }
        while (this.rooms.isGameCreated(id));
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        this.rooms.setGameCreation(id, await new Auth().createPasswordHash(password));
        const game = this.rooms.games[id];
        game.name = req.body.name.trim();
        game.gmAccountId = res.locals.account.id;
        game.hasPassword = password !== "";
        this.rooms.save(id);
        res.status(201).json({ room: { id, name: game.name, hasPassword: game.hasPassword, sizeBytes: this.database.roomSizeBytes(game.gameId) } });
      } catch (error) { next(error); }
    });
    router.patch("/rooms/:id", (req, res, next) => {
      if (!this.rooms.isGameCreated(req.params.id)) {
        res.status(404).json({ error: "room_not_found", message: "That room does not exist." });
        return;
      }
      if (this.rooms.games[req.params.id].gmAccountId !== res.locals.account.id) {
        res.status(403).json({ error: "not_room_gm", message: "Only the room's GM can rename it." });
        return;
      }
      next();
    }, roomName, (req, res) => {
      const game = this.rooms.games[req.params.id];
      game.name = req.body.name;
      this.rooms.save(game.gameId);
      this.renamed(game.gameId, game.name);
      res.json({ room: { id: game.gameId, name: game.name, hasPassword: game.hasPassword, sizeBytes: this.database.roomSizeBytes(game.gameId) } });
    });
    router.delete("/rooms/:id", async (req, res, next) => {
      if (!this.rooms.isGameCreated(req.params.id)) {
        res.status(404).json({ error: "room_not_found", message: "That room does not exist." });
        return;
      }
      if (this.rooms.games[req.params.id].gmAccountId !== res.locals.account.id) {
        res.status(403).json({ error: "not_room_gm", message: "Only the room's GM can delete it." });
        return;
      }
      try {
        await this.deleteRoom(req.params.id);
        res.sendStatus(204);
      } catch (error) { next(error); }
    });
    return router;
  }
}
