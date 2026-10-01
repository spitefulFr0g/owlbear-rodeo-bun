import { describe, expect, test } from "bun:test";
import type { NetworkInterfaceInfo } from "os";
import { lanUrls } from "./lanUrls";

function iface(
  address: string,
  family: "IPv4" | "IPv6",
  internal = false
): NetworkInterfaceInfo {
  return {
    address,
    family,
    internal,
    netmask: "",
    mac: "",
    cidr: null,
    ...(family === "IPv6" ? { scopeid: 0 } : {}),
  } as NetworkInterfaceInfo;
}

describe("lanUrls", () => {
  test("lists external IPv4 addresses only", () => {
    const urls = lanUrls(9000, {
      lo: [iface("127.0.0.1", "IPv4", true), iface("::1", "IPv6", true)],
      eth0: [iface("192.168.1.20", "IPv4"), iface("fe80::1", "IPv6")],
      wlan0: [iface("10.0.0.5", "IPv4")],
    });
    expect(urls).toEqual(["http://192.168.1.20:9000", "http://10.0.0.5:9000"]);
  });

  test("skips link-local addresses", () => {
    expect(lanUrls(9000, { eth1: [iface("169.254.83.107", "IPv4")] })).toEqual(
      []
    );
  });

  test("returns an empty list with no external interfaces", () => {
    expect(lanUrls(9000, { lo: [iface("127.0.0.1", "IPv4", true)] })).toEqual(
      []
    );
  });
});
