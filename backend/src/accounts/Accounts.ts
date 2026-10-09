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
  constructor(private readonly database: OwlbearDatabase, private readonly clock: Clock) {}

  async setup(username: string, password: string): Promise<{ account: Account; token: string } | null> {
    if (this.hasAdministrator()) return null;
    const passwordHash = await new Auth().createPasswordHash(password);
    return this.database.transaction(() => {
      if (this.hasAdministrator()) return null;
      const account = { id: randomUUID(), username, administrator: true };
      this.database.connection.query("INSERT INTO accounts (id, username, passwordHash, administrator) VALUES (?, ?, ?, 1)").run(account.id, username, passwordHash);
      const token = randomBytes(32).toString("hex");
      this.database.connection.query("INSERT INTO sign_ins (tokenHash, accountId, createdAt, lastUsedAt) VALUES (?, ?, ?, ?)").run(this.tokenHash(token), account.id, this.clock.now(), this.clock.now());
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

  list(): Account[] {
    return this.database.connection.query<{ id: string; username: string; administrator: number }, []>("SELECT id, username, administrator FROM accounts ORDER BY username").all()
      .map(row => ({ ...row, administrator: !!row.administrator }));
  }

  createInvite(): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString("hex");
    const expiresAt = this.clock.now() + 7 * 24 * 60 * 60 * 1000;
    this.database.connection.query("INSERT INTO invites (tokenHash, expiresAt) VALUES (?, ?)").run(this.tokenHash(token), expiresAt);
    return { token, expiresAt };
  }

  inviteUsable(token: string): boolean {
    return !!this.database.connection.query("SELECT 1 FROM invites WHERE tokenHash = ? AND expiresAt > ?").get(this.tokenHash(token), this.clock.now());
  }

  async acceptInvite(token: string, username: unknown, password: unknown) {
    if (!this.inviteUsable(token)) return { error: "link_invalid" } as const;
    if (typeof username !== "string" || username.length < 3 || username.length > 32) return { error: "username_length" } as const;
    if (!/^[A-Za-z0-9._-]+$/.test(username)) return { error: "username_characters" } as const;
    if (typeof password !== "string" || password.length < 8) return { error: "password_too_short" } as const;
    const passwordHash = await new Auth().createPasswordHash(password);
    return this.database.transaction(() => {
      if (!this.inviteUsable(token)) return { error: "link_invalid" } as const;
      if (this.database.connection.query("SELECT 1 FROM accounts WHERE username = ? COLLATE NOCASE").get(username)) return { error: "username_taken" } as const;
      const account = { id: randomUUID(), username, administrator: false };
      this.database.connection.query("INSERT INTO accounts (id, username, passwordHash, administrator) VALUES (?, ?, ?, 0)").run(account.id, username, passwordHash);
      this.database.connection.query("DELETE FROM invites WHERE tokenHash = ?").run(this.tokenHash(token));
      const signInToken = randomBytes(32).toString("hex");
      this.database.connection.query("INSERT INTO sign_ins (tokenHash, accountId, createdAt, lastUsedAt) VALUES (?, ?, ?, ?)").run(this.tokenHash(signInToken), account.id, this.clock.now(), this.clock.now());
      return { account, token: signInToken };
    });
  }

  hasAdministrator(): boolean {
    return !!this.database.connection.query("SELECT 1 FROM accounts WHERE administrator = 1 LIMIT 1").get();
  }
}
