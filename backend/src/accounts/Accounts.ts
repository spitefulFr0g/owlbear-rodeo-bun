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
  private readonly signInWatchers = new Map<string, Set<() => void>>();

  constructor(private readonly database: OwlbearDatabase, private readonly clock: Clock, private reopenSetup = false) {}

  setupState(): "required" | "open" | "closed" {
    // With no administrator the flag changes nothing: setup is required anyway
    if (!this.hasAdministrator()) return "required";
    return this.reopenSetup ? "open" : "closed";
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
      this.notifySignIn(hash);
      return null;
    }
    if (this.clock.now() - row.lastUsedAt >= 60 * 60 * 1000) {
      this.database.connection.query("UPDATE sign_ins SET lastUsedAt = ? WHERE tokenHash = ?").run(this.clock.now(), hash);
      refreshCookie?.(token);
      this.notifySignIn(hash);
    }
    return { id: row.id, username: row.username, administrator: !!row.administrator };
  }

  signOut(request: Pick<IncomingMessage, "headers">): void {
    const token = this.signInToken(request);
    if (token) {
      const hash = this.tokenHash(token);
      this.database.connection.query("DELETE FROM sign_ins WHERE tokenHash = ?").run(hash);
      this.notifySignIn(hash);
    }
  }

  // Watch the original handshake sign-in without extending its lifetime.
  watchSignIn(request: Pick<IncomingMessage, "headers">, ended: () => void): () => void {
    const token = this.signInToken(request);
    if (!token) return () => undefined;
    const hash = this.tokenHash(token);
    let cancel: () => void = () => undefined;
    const check = () => {
      cancel();
      const row = this.database.connection.query<{ lastUsedAt: number }, [string]>("SELECT lastUsedAt FROM sign_ins WHERE tokenHash = ?").get(hash);
      if (!row || this.clock.now() - row.lastUsedAt >= SIGN_IN_LIFETIME_MS) {
        this.database.connection.query("DELETE FROM sign_ins WHERE tokenHash = ?").run(hash);
        ended();
        return;
      }
      // Runtime timers accept at most a signed 32-bit delay; 30 days exceeds it.
      cancel = this.clock.after(Math.min(2147483647, row.lastUsedAt + SIGN_IN_LIFETIME_MS - this.clock.now()), check);
    };
    const watchers = this.signInWatchers.get(hash) ?? new Set<() => void>();
    watchers.add(check);
    this.signInWatchers.set(hash, watchers);
    check();
    return () => {
      cancel();
      watchers.delete(check);
      if (!watchers.size) this.signInWatchers.delete(hash);
    };
  }

  private endSignIns(accountId: string, exceptHash?: string): void {
    const rows = this.database.connection.query<{ tokenHash: string }, [string, string]>(
      "SELECT tokenHash FROM sign_ins WHERE accountId = ? AND tokenHash != ?"
    ).all(accountId, exceptHash ?? "");
    this.database.connection.query("DELETE FROM sign_ins WHERE accountId = ? AND tokenHash != ?").run(accountId, exceptHash ?? "");
    for (const row of rows) this.notifySignIn(row.tokenHash);
  }

  private notifySignIn(hash: string): void {
    for (const check of [...this.signInWatchers.get(hash) ?? []]) check();
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

  createResetLink(accountId: string): { token: string; expiresAt: number } | null {
    if (!this.database.connection.query("SELECT 1 FROM accounts WHERE id = ?").get(accountId)) return null;
    const token = randomBytes(32).toString("hex");
    const expiresAt = this.clock.now() + 7 * 24 * 60 * 60 * 1000;
    this.database.connection.query("INSERT INTO resets (tokenHash, accountId, expiresAt) VALUES (?, ?, ?)").run(this.tokenHash(token), accountId, expiresAt);
    return { token, expiresAt };
  }

  resetAccount(token: string): Account | null {
    const row = this.database.connection.query<{ id: string; username: string; administrator: number }, [string, number]>(
      "SELECT accounts.id, username, administrator FROM resets JOIN accounts ON accounts.id = resets.accountId WHERE tokenHash = ? AND expiresAt > ?"
    ).get(this.tokenHash(token), this.clock.now());
    return row ? { ...row, administrator: !!row.administrator } : null;
  }

  async acceptReset(token: string, password: unknown) {
    if (!this.resetAccount(token)) return { error: "link_invalid" } as const;
    if (typeof password !== "string" || password.length < 8) return { error: "password_too_short" } as const;
    const passwordHash = await new Auth().createPasswordHash(password);
    return this.database.transaction(() => {
      const account = this.resetAccount(token);
      if (!account) return { error: "link_invalid" } as const;
      this.database.connection.query("UPDATE accounts SET passwordHash = ? WHERE id = ?").run(passwordHash, account.id);
      this.database.connection.query("DELETE FROM resets WHERE tokenHash = ?").run(this.tokenHash(token));
      this.endSignIns(account.id);
      const signInToken = randomBytes(32).toString("hex");
      this.database.connection.query("INSERT INTO sign_ins (tokenHash, accountId, createdAt, lastUsedAt) VALUES (?, ?, ?, ?)").run(this.tokenHash(signInToken), account.id, this.clock.now(), this.clock.now());
      return { account, token: signInToken };
    });
  }

  async changePassword(request: Pick<IncomingMessage, "headers">, currentPassword: unknown, newPassword: unknown) {
    const account = this.resolveAccount(request);
    if (!account) return { error: "not_signed_in" } as const;
    const row = this.database.connection.query<{ passwordHash: string }, [string]>("SELECT passwordHash FROM accounts WHERE id = ?").get(account.id);
    if (!row || typeof currentPassword !== "string" || !await new Auth().checkPassword(currentPassword, row.passwordHash)) return { error: "wrong_password" } as const;
    if (typeof newPassword !== "string" || newPassword.length < 8) return { error: "password_too_short" } as const;
    const passwordHash = await new Auth().createPasswordHash(newPassword);
    return this.database.transaction(() => {
      // Password hashing yields: a reset or another change may have ended this sign-in meanwhile.
      if (!this.resolveAccount(request)) return { error: "not_signed_in" } as const;
      const changed = this.database.connection.query("UPDATE accounts SET passwordHash = ? WHERE id = ? AND passwordHash = ?").run(passwordHash, account.id, row.passwordHash);
      if (!changed.changes) return { error: "wrong_password" } as const;
      this.endSignIns(account.id, this.tokenHash(this.signInToken(request)!));
      return {};
    });
  }

  setAdministrator(id: string, administrator: boolean) {
    return this.database.transaction(() => {
      const account = this.list().find(account => account.id === id);
      if (!account) return { error: "account_not_found" } as const;
      if (account.administrator && !administrator && this.list().filter(account => account.administrator).length === 1) return { error: "last_administrator" } as const;
      this.database.connection.query("UPDATE accounts SET administrator = ? WHERE id = ?").run(Number(administrator), id);
      return { account: { ...account, administrator } };
    });
  }

  removeAccount(id: string, callerId: string) {
    return this.database.transaction(() => {
      const account = this.list().find(account => account.id === id);
      if (!account) return { error: "account_not_found" } as const;
      if (id === callerId) return { error: "cannot_remove_self" } as const;
      if (account.administrator && this.list().filter(account => account.administrator).length === 1) return { error: "last_administrator" } as const;
      this.database.connection.query("UPDATE rooms SET gmAccountId = ? WHERE gmAccountId = ?").run(callerId, id);
      this.endSignIns(id);
      this.database.connection.query("DELETE FROM accounts WHERE id = ?").run(id);
      return { removed: true } as const;
    });
  }

  hasAdministrator(): boolean {
    return !!this.database.connection.query("SELECT 1 FROM accounts WHERE administrator = 1 LIMIT 1").get();
  }
}
