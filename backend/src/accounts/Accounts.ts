import { randomBytes, randomUUID, createHash } from "crypto";
import { IncomingMessage } from "http";
import Auth from "../entities/Auth";
import { Clock } from "../clock";
import { OwlbearDatabase } from "../database";

export interface Account {
  id: string;
  username: string;
  administrator: boolean;
}

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

  resolveAccount(request: Pick<IncomingMessage, "headers">): Account | null {
    const cookie = request.headers.cookie?.split(";").map(part => part.trim())
      .find(part => part.startsWith("owlbear_sign_in="));
    if (!cookie) return null;
    const hash = this.tokenHash(cookie.slice("owlbear_sign_in=".length));
    const row = this.database.connection.query<{ id: string; username: string; administrator: number }, [string]>(
      "SELECT accounts.id, username, administrator FROM sign_ins JOIN accounts ON accounts.id = sign_ins.accountId WHERE tokenHash = ?"
    ).get(hash);
    if (!row) return null;
    this.database.connection.query("UPDATE sign_ins SET lastUsedAt = ? WHERE tokenHash = ?").run(this.clock.now(), hash);
    return { ...row, administrator: !!row.administrator };
  }

  private tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  hasAdministrator(): boolean {
    return !!this.database.connection.query("SELECT 1 FROM accounts WHERE administrator = 1 LIMIT 1").get();
  }
}
