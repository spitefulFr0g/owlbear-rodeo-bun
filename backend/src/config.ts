import { parseArgs } from "util";

export interface Config {
  port: number;
  /** Extra origins allowed to connect. Same-origin is always allowed. */
  allowOrigin: RegExp | null;
  /** JSON file replacing the bundled ICE server list. */
  iceServersFile?: string;
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
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });

  return {
    port: parsePort(values.port ?? env.PORT ?? "9000"),
    allowOrigin: parseOrigin(values["allow-origin"] ?? env.ALLOW_ORIGIN),
    iceServersFile: values["ice-servers"] ?? env.ICE_SERVERS_FILE,
    help: values.help ?? false,
  };
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
