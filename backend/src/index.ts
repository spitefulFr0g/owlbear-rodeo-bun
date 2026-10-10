import { resolve } from "path";
import { Config, defaultDataDir, parseConfig, USAGE } from "./config";
import { realClock } from "./clock";
import { startServer } from "./server";

let config: Config;
try {
  config = parseConfig(process.argv.slice(2), process.env);
} catch (error: any) {
  console.error(`${error.message}\n\n${USAGE}`);
  process.exit(1);
}
if (config.help) {
  console.log(USAGE);
  process.exit(0);
}

let server;
try {
  server = await startServer({
    ...config,
    dataDir: resolve(
      config.dataDir ?? defaultDataDir(process.execPath, Bun.main, process.cwd())
    ),
    clock: realClock,
  });
} catch (error: any) {
  console.error(error.message);
  process.exit(1);
}

const stop = () => {
  server.stop().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
  // Do not wait forever on a connection that will not close
  setTimeout(() => process.exit(), 3000).unref();
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

process.on("unhandledRejection", (reason, p) => {
  console.log("Unhandled Rejection at: Promise", p, "reason:", reason);
});
