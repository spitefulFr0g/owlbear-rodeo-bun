/**
 * Builds the frontend into ../build with Vite.
 *
 * In a git worktree with no node_modules of its own, the build borrows the
 * main checkout's, as long as their dependency declarations and lock match.
 */
import { $ } from "bun";
import { join } from "path";

const { setup } = require("../../scripts/frontend.cjs");

const repoDir = join(import.meta.dir, "..", "..");
const modules: string = setup(repoDir);

await $`node ${join(modules, "vite", "bin", "vite.js")} build`.cwd(repoDir);
