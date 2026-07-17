import { describe, expect, it } from "vitest";
import {
  assertWebDavTargetAddress,
  parseWebDavPrivateTargets,
  resolveWebDavTarget,
} from "../../../../server/adapters/webdav/webDavTargetPolicy.ts";

const noPrivateTargets = parseWebDavPrivateTargets(undefined);

describe("WebDAV target network policy", () => {
  it("allows global-unicast targets without an allowlist", async () => {
    await expect(resolveWebDavTarget(
      new URL("https://dav.example.test/root/"),
      noPrivateTargets,
      async () => [{ address: "8.8.8.8", family: 4 }],
    )).resolves.toEqual({ address: "8.8.8.8", family: 4 });
  });

  it("requires exact-origin or CIDR authorization for private targets", () => {
    const policy = parseWebDavPrivateTargets(
      "https://nas.example.test:8443,192.168.20.0/24 fd12:3456::/32",
    );

    expect(() => assertWebDavTargetAddress(
      new URL("https://nas.example.test:8443/repository/"),
      "10.0.0.8",
      policy,
    )).not.toThrow();
    expect(() => assertWebDavTargetAddress(
      new URL("https://another.example.test/"),
      "192.168.20.42",
      policy,
    )).not.toThrow();
    expect(() => assertWebDavTargetAddress(
      new URL("https://another.example.test/"),
      "fd12:3456::42",
      policy,
    )).not.toThrow();

    expect(() => assertWebDavTargetAddress(
      new URL("https://nas.example.test/repository/"),
      "10.0.0.8",
      policy,
    )).toThrow("not authorized");
    expect(() => assertWebDavTargetAddress(
      new URL("https://another.example.test/"),
      "192.168.21.42",
      policy,
    )).toThrow("not authorized");
  });

  it("classifies loopback, CGNAT, ULA, and IPv4-mapped IPv6 as private", () => {
    for (const address of [
      "127.0.0.1",
      "100.64.0.1",
      "fc00::1",
      "::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(() => assertWebDavTargetAddress(
        new URL("https://dav.example.test/"),
        address,
        noPrivateTargets,
      ), address).toThrow("not authorized");
    }

    const policy = parseWebDavPrivateTargets("127.0.0.0/8");

    expect(() => assertWebDavTargetAddress(
      new URL("https://dav.example.test/"),
      "::ffff:127.0.0.1",
      policy,
    )).not.toThrow();
  });

  it("always rejects link-local, metadata, unspecified, multicast, and reserved ranges", () => {
    const policy = parseWebDavPrivateTargets([
      "https://dav.example.test",
      "0.0.0.0/0",
      "::/0",
    ].join(","));

    for (const address of [
      "0.0.0.0",
      "169.254.169.254",
      "192.0.2.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "fe80::1",
      "2001:db8::1",
      "ff02::1",
    ]) {
      expect(() => assertWebDavTargetAddress(
        new URL("https://dav.example.test/"),
        address,
        policy,
      ), address).toThrow("prohibited");
    }
  });

  it("rejects a mixed DNS answer when any address is prohibited or unauthorized", async () => {
    await expect(resolveWebDavTarget(
      new URL("https://dav.example.test/"),
      noPrivateTargets,
      async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    )).rejects.toThrow("not authorized");
  });

  it("resolves every request again so a DNS rebind cannot reuse an approved answer", async () => {
    let lookupCount = 0;
    const lookup = async () => {
      lookupCount += 1;
      return lookupCount === 1
        ? [{ address: "8.8.8.8", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }];
    };
    const url = new URL("https://dav.example.test/");

    await expect(resolveWebDavTarget(url, noPrivateTargets, lookup))
      .resolves.toEqual({ address: "8.8.8.8", family: 4 });
    await expect(resolveWebDavTarget(url, noPrivateTargets, lookup))
      .rejects.toThrow("not authorized");
    expect(lookupCount).toBe(2);
  });

  it("rejects inconsistent DNS family metadata", async () => {
    await expect(resolveWebDavTarget(
      new URL("https://dav.example.test/"),
      noPrivateTargets,
      async () => [{ address: "8.8.8.8", family: 6 }],
    )).rejects.toThrow("invalid address");
  });

  it("parses only exact origins and CIDRs from the private-target setting", () => {
    expect(() => parseWebDavPrivateTargets("https://dav.example.test/path"))
      .toThrow("Invalid CTN_WEBDAV_PRIVATE_TARGETS origin");
    expect(() => parseWebDavPrivateTargets("https://user@dav.example.test"))
      .toThrow("Invalid CTN_WEBDAV_PRIVATE_TARGETS origin");
    expect(() => parseWebDavPrivateTargets("https://dav.example.test?token=secret"))
      .toThrow("Invalid CTN_WEBDAV_PRIVATE_TARGETS origin");
    expect(() => parseWebDavPrivateTargets("192.168.0.0/33"))
      .toThrow("Invalid CTN_WEBDAV_PRIVATE_TARGETS entry");
  });
});
