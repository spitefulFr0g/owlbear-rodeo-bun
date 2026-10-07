import { dirname, join } from "path";
import { parseArgs } from "util";

export interface Config {
  port: number;
  /** Extra origins allowed to connect. Same-origin is always allowed. */
  allowOrigin: RegExp | null;
  /** JSON file replacing the bundled ICE server list. */
  iceServersFile?: string;
  /** Directory that uploaded assets are kept in. */
  dataDir?: string;
  help: boolean;
}

export const USAGE = `Usage: owlbear-rodeo [options]

Options:
  -p, --port <port>          Port to listen on (env PORT, default 9000)
      --allow-origin <regex> Also accept connections from origins matching
                             this pattern (env ALLOW_ORIGIN)
      --ice-servers <file>   JSON file with {"iceServers": [...]} to use
                             instead of the default STUN server
                             (env ICE_SERVERS_FILE)
      --data-dir <dir>       Directory to keep uploaded maps and tokens in
                             (env DATA_DIR, default "data" beside the
                             executable)
  -h, --help                 Show this help`;

export function parseConfig(
  argv: string[],
  env: Record<string, string | undefined>
): Config {
  const { values } = parseArgs({
    args: argv,
    options: {
      port: { type: "string", short: "p" },
      "allow-origin": { type: "string" },
      "ice-servers": { type: "string" },
      "data-dir": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  return {
    port: parsePort(values.port ?? env.PORT ?? "9000"),
    allowOrigin: parseOrigin(values["allow-origin"] ?? env.ALLOW_ORIGIN),
    iceServersFile: values["ice-servers"] ?? env.ICE_SERVERS_FILE,
    dataDir: values["data-dir"] || env.DATA_DIR || undefined,
    help: values.help ?? false,
  };
}

/**
 * Where data goes when no directory is configured: a `data` folder beside the
 * executable, or in the working directory when running from source.
 *
 * @param mainPath Path of the entry script (`Bun.main`), which is inside
 * Bun's virtual filesystem in a compiled executable
 */
export function defaultDataDir(
  execPath: string,
  mainPath: string,
  cwd: string
): string {
  const compiled = /^(\/\$bunfs\/|[A-Za-z]:[\\/]~BUN[\\/])/.test(mainPath);
  return join(compiled ? dirname(execPath) : cwd, "data");
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port "${value}"`);
  }
  return port;
}

function parseOrigin(value: string | undefined): RegExp | null {
  if (!value) {
    return null;
  }
  try {
    return new RegExp(value);
  } catch {
    throw new Error(`Invalid allow-origin pattern "${value}"`);
  }
}
