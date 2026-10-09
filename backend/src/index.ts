import { resolve } from "path";
import { defaultDataDir, parseConfig, USAGE } from "./config";
import { realClock } from "./clock";
import { startServer } from "./server";

try {
  const config = parseConfig(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(USAGE);
  } else {
    const server = await startServer({
      ...config,
      dataDir: resolve(config.dataDir ?? defaultDataDir(process.execPath, Bun.main, process.cwd())),
      clock: realClock,
    });
    const stop = () => { void server.stop().catch((error) => { console.error(error); process.exitCode = 1; }); };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  }
} catch (error: any) {
  console.error(`${error.message}\n\n${USAGE}`);
  process.exitCode = 1;
}
