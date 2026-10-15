import { expect, test } from "bun:test";
// @ts-expect-error eslint 8 ships without types, and only this test needs them.
import { ESLint } from "eslint";
import { join } from "path";

const eslint = new ESLint({ cwd: join(import.meta.dir, "..") });

async function refused(file: string, source: string) {
  const [result] = await eslint.lintText(`${source}\nexport {};\n`, { filePath: join(import.meta.dir, "..", file) });
  return result.messages.filter((message: { ruleId: string | null }) => message.ruleId === "no-restricted-imports").length;
}

test("a test may not import the database or a server module, wherever it sits", async () => {
  expect(await refused("src/new.test.ts", 'import { Database } from "bun:sqlite";')).toBe(1);
  expect(await refused("src/new.test.ts", 'import "./database/library";')).toBe(1);
  expect(await refused("src/new.test.ts", 'import "./entities/Auth";')).toBe(1);
  expect(await refused("src/new.test.ts", 'import "./controllers/AssetController";')).toBe(1);
  expect(await refused("src/entities/New.test.ts", 'import "./Auth";')).toBe(1);
  expect(await refused("src/controllers/New.test.ts", 'import "./AssetController";')).toBe(1);
  expect(await refused("src/database/new.test.ts", 'import "./library";')).toBe(1);
});

test("a test may import the test helpers and the shared rules", async () => {
  expect(await refused("src/new.test.ts", 'import "./testing/serverHelpers";')).toBe(0);
  expect(await refused("src/entities/New.test.ts", 'import "../testing/serverHelpers";')).toBe(0);
  expect(await refused("src/new.test.ts", 'import "../../src/sceneRules";')).toBe(0);
});
