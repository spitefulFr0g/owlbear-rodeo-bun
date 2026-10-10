// Bun.password rejects empty strings, but games without a password join with
// "". Prefix every password consistently when hashing and verifying.
const PREFIX = "owlbear:";

// The bcrypt cost of a new hash. The tests lower it, see scripts/test-setup.ts.
export const hashing = { cost: 10 };

export default class Auth implements Auth {
  async createPasswordHash(
    password: string,
    saltRounds = hashing.cost
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
