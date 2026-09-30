// Bun.password rejects empty strings, but games without a password join with
// "". Hashes only live in memory, so prefixing every password is safe.
const PREFIX = "owlbear:";

export default class Auth implements Auth {
  async createPasswordHash(
    password: string,
    saltRounds: number = 10
  ): Promise<string> {
    const hash = await Bun.password.hash(PREFIX + password, {
      algorithm: "bcrypt",
      cost: saltRounds,
    });
    return hash;
  }

  async checkPassword(password: string, hash: string): Promise<boolean> {
    const result = await Bun.password.verify(PREFIX + password, hash, "bcrypt");
    return result;
  }
}
