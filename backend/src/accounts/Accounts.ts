import { randomBytes, randomUUID, createHash } from "crypto";
import { IncomingMessage } from "http";
import { SIGN_IN_LIFETIME_MS } from "./signInCookie";
import Auth from "../entities/Auth";
import { Clock } from "../clock";
import { OwlbearDatabase } from "../database";

export interface Account {
  id: string;
  username: string;
  administrator: boolean;
}

// A cost-10 bcrypt hash, matching account passwords, for names without an account.
const UNKNOWN_PASSWORD_HASH = "$2b$10$Y0Lpwb.O8hQl95PBTsjx6u4vkMkcws1/I4A4eB51H6UqIXfFoZh4S";

export default class Accounts {
  constructor(private readonly database: OwlbearDatabase, private readonly clock: Clock, private reopenSetup = false) {}

  setupState(): "required" | "open" | "closed" {
    return this.reopenSetup ? "open" : this.hasAdministrator() ? "closed" : "required";
  }

  async setup(username: string, password: string): Promise<{ account: Account; token: string } | "username_taken" | null> {
    if (this.setupState() === "closed") return null;
    const passwordHash = await new Auth().createPasswordHash(password);
    return this.database.transaction(() => {
      if (this.setupState() === "closed") return null;
      if (this.database.connection.query("SELECT 1 FROM accounts WHERE username = ? COLLATE NOCASE").get(username)) return "username_taken";
      const account = { id: randomUUID(), username, administrator: true };
      this.database.connection.query("INSERT INTO accounts (id, username, passwordHash, administrator) VALUES (?, ?, ?, 1)").run(account.id, username, passwordHash);
      const token = randomBytes(32).toString("hex");
      this.database.connection.query("INSERT INTO sign_ins (tokenHash, accountId, createdAt, lastUsedAt) VALUES (?, ?, ?, ?)").run(this.tokenHash(token), account.id, this.clock.now(), this.clock.now());
      this.reopenSetup = false;
      return { account, token };
    });
  }

  async signIn(username: string, password: string): Promise<{ account: Account; token: string } | null> {
    const row = this.database.connection.query<{ id: string; username: string; administrator: number; passwordHash: string }, [string]>(
      "SELECT id, username, administrator, passwordHash FROM accounts WHERE username = ? COLLATE NOCASE"
    ).get(username);
    const matches = await new Auth().checkPassword(password, row?.passwordHash ?? UNKNOWN_PASSWORD_HASH);
    if (!row || !matches) return null;
    const account = { id: row.id, username: row.username, administrator: !!row.administrator };
    const token = randomBytes(32).toString("hex");
    this.database.connection.query("INSERT INTO sign_ins (tokenHash, accountId, createdAt, lastUsedAt) VALUES (?, ?, ?, ?)").run(this.tokenHash(token), account.id, this.clock.now(), this.clock.now());
    return { account, token };
  }

  // HTTP callers renew the browser cookie when the durable last-use time advances.
  resolveAccount(request: Pick<IncomingMessage, "headers">, refreshCookie?: (token: string) => void): Account | null {
    const token = this.signInToken(request);
    if (!token) return null;
    const hash = this.tokenHash(token);
    const row = this.database.connection.query<{ id: string; username: string; administrator: number; lastUsedAt: number }, [string]>(
      "SELECT accounts.id, username, administrator, lastUsedAt FROM sign_ins JOIN accounts ON accounts.id = sign_ins.accountId WHERE tokenHash = ?"
    ).get(hash);
    if (!row) return null;
    if (this.clock.now() - row.lastUsedAt >= SIGN_IN_LIFETIME_MS) {
      this.database.connection.query("DELETE FROM sign_ins WHERE tokenHash = ?").run(hash);
      return null;
    }
    if (this.clock.now() - row.lastUsedAt >= 60 * 60 * 1000) {
      this.database.connection.query("UPDATE sign_ins SET lastUsedAt = ? WHERE tokenHash = ?").run(this.clock.now(), hash);
      refreshCookie?.(token);
    }
    return { id: row.id, username: row.username, administrator: !!row.administrator };
  }

  signOut(request: Pick<IncomingMessage, "headers">): void {
    const token = this.signInToken(request);
    if (token) this.database.connection.query("DELETE FROM sign_ins WHERE tokenHash = ?").run(this.tokenHash(token));
  }

  private signInToken(request: Pick<IncomingMessage, "headers">): string | undefined {
    return request.headers.cookie?.split(";").map(part => part.trim())
      .find(part => part.startsWith("owlbear_sign_in="))?.slice("owlbear_sign_in=".length);
  }

  private tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  hasAdministrator(): boolean {
    return !!this.database.connection.query("SELECT 1 FROM accounts WHERE administrator = 1 LIMIT 1").get();
  }
}
