import type { NetworkInterfaceInfo } from "os";

/** URLs other machines on the network can use to reach this server. */
export function lanUrls(
  port: number,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>
): string[] {
  return Object.values(interfaces)
    .flatMap((addresses) => addresses ?? [])
    .filter(
      (address) =>
        address.family === "IPv4" &&
        !address.internal &&
        // Link-local addresses are only assigned when DHCP fails
        !address.address.startsWith("169.254.")
    )
    .map((address) => `http://${address.address}:${port}`);
}
