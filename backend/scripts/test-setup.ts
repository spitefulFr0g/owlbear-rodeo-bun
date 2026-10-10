/**
 * Preloaded by `bun test`. Hashes passwords at the lowest bcrypt cost, so a
 * test that makes an account or a room password does not wait on the hash.
 */
import { hashing } from "../src/entities/Auth";

hashing.cost = 4;
