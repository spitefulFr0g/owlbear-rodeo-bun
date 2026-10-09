// Bun.password rejects empty strings, but games without a password join with
// "". Hashes only live in memory, so prefixing every password is safe.
const PREFIX = "owlbear:";

export default class Auth implements Auth {
  async createPasswordHash(
    password: string,
    saltRounds = 10
  ): Promise<string> {
    return Bun.password.hash(PREFIX + password, {
      algorithm: "bcrypt",
      cost: saltRounds,
    });
  }

  async checkPassword(password: string, hash: string): Promise<boolean> {
    return Bun.password.verify(PREFIX + password, hash, "bcrypt");
  }
}
