// SPDX-License-Identifier: GPL-3.0-or-later

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

type IpFamily = 4 | 6;

type IpValue = {
  family: IpFamily;
  value: bigint;
};

type CidrRange = IpValue & {
  prefixLength: number;
};

export type WebDavPrivateTargetPolicy = {
  cidrs: readonly CidrRange[];
  origins: ReadonlySet<string>;
};

export type WebDavDnsLookup = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;

export type ResolvedWebDavTarget = {
  address: string;
  family: IpFamily;
};

const emptyPrivateTargetPolicy: WebDavPrivateTargetPolicy = {
  cidrs: [],
  origins: new Set(),
};

function parseIpv4(source: string): bigint | null {
  const segments = source.split(".");

  if (segments.length !== 4) {
    return null;
  }

  let value = 0n;

  for (const segment of segments) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(segment)) {
      return null;
    }
    const octet = Number(segment);

    if (octet > 255) {
      return null;
    }
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIpv6(source: string): bigint | null {
  if (source.includes("%")) {
    return null;
  }

  let normalized = source.toLowerCase();
  const ipv4Tail = /(?:^|:)([0-9]+(?:\.[0-9]+){3})$/.exec(normalized)?.[1];

  if (ipv4Tail) {
    const ipv4 = parseIpv4(ipv4Tail);

    if (ipv4 === null) {
      return null;
    }
    const high = ((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = (ipv4 & 0xffffn).toString(16);

    normalized = `${normalized.slice(0, -ipv4Tail.length)}${high}:${low}`;
  }

  const compressionParts = normalized.split("::");

  if (compressionParts.length > 2) {
    return null;
  }
  const left = compressionParts[0]
    ? compressionParts[0].split(":")
    : [];
  const right = compressionParts.length === 2 && compressionParts[1]
    ? compressionParts[1].split(":")
    : [];

  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }

  const omitted = 8 - left.length - right.length;

  if (
    omitted < 0 ||
    (compressionParts.length === 1 && omitted !== 0) ||
    (compressionParts.length === 2 && omitted < 1)
  ) {
    return null;
  }

  const parts = [
    ...left,
    ...Array.from({ length: omitted }, () => "0"),
    ...right,
  ];
  let value = 0n;

  for (const part of parts) {
    value = (value << 16n) | BigInt(`0x${part}`);
  }
  return value;
}

function parseIp(source: string): IpValue | null {
  const family = isIP(source);

  if (family === 4) {
    const value = parseIpv4(source);
    return value === null ? null : { family, value };
  }
  if (family === 6) {
    const value = parseIpv6(source);

    if (value === null) {
      return null;
    }
    // Treat IPv4-mapped IPv6 as IPv4 so it cannot bypass IPv4 policy.
    if (value >> 32n === 0xffffn) {
      return { family: 4, value: value & 0xffff_ffffn };
    }
    return { family, value };
  }
  return null;
}

function createMask(family: IpFamily, prefixLength: number) {
  const bits = family === 4 ? 32 : 128;

  if (prefixLength === 0) {
    return 0n;
  }
  return ((1n << BigInt(prefixLength)) - 1n) << BigInt(bits - prefixLength);
}

function parseCidr(source: string): CidrRange | null {
  const [address, prefixSource, ...extra] = source.split("/");

  if (!address || !prefixSource || extra.length > 0 || !/^\d+$/.test(prefixSource)) {
    return null;
  }
  const ip = parseIp(address);

  if (!ip) {
    return null;
  }
  const prefixLength = Number(prefixSource);
  const bits = ip.family === 4 ? 32 : 128;

  if (prefixLength < 0 || prefixLength > bits) {
    return null;
  }
  const mask = createMask(ip.family, prefixLength);
  return {
    family: ip.family,
    prefixLength,
    value: ip.value & mask,
  };
}

function isInRange(ip: IpValue, source: string, prefixLength: number) {
  const rangeIp = parseIp(source);

  if (!rangeIp || rangeIp.family !== ip.family) {
    return false;
  }
  const mask = createMask(ip.family, prefixLength);
  return (ip.value & mask) === (rangeIp.value & mask);
}

function isHardDenied(ip: IpValue) {
  if (ip.family === 4) {
    return [
      ["0.0.0.0", 8],
      ["169.254.0.0", 16],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([source, prefix]) => isInRange(ip, source as string, prefix as number));
  }

  return (
    ip.value === 0n ||
    isInRange(ip, "fe80::", 10) ||
    isInRange(ip, "ff00::", 8) ||
    isInRange(ip, "2001:db8::", 32) ||
    (!isInRange(ip, "2000::", 3) &&
      !isInRange(ip, "fc00::", 7) &&
      ip.value !== 1n)
  );
}

function isPrivate(ip: IpValue) {
  if (ip.family === 4) {
    return [
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["172.16.0.0", 12],
      ["192.168.0.0", 16],
    ].some(([source, prefix]) => isInRange(ip, source as string, prefix as number));
  }

  return ip.value === 1n || isInRange(ip, "fc00::", 7);
}

function cidrContains(range: CidrRange, ip: IpValue) {
  return range.family === ip.family &&
    (ip.value & createMask(ip.family, range.prefixLength)) === range.value;
}

export function parseWebDavPrivateTargets(
  source: string | undefined,
): WebDavPrivateTargetPolicy {
  if (source === undefined || source.trim() === "") {
    return emptyPrivateTargetPolicy;
  }

  const origins = new Set<string>();
  const cidrs: CidrRange[] = [];
  const entries = source.split(/[\s,]+/).filter(Boolean);

  for (const entry of entries) {
    const cidr = parseCidr(entry);

    if (cidr) {
      cidrs.push(cidr);
      continue;
    }

    let url: URL;

    try {
      url = new URL(entry);
    } catch {
      throw new Error(`Invalid CTN_WEBDAV_PRIVATE_TARGETS entry: ${entry}`);
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new Error(`Invalid CTN_WEBDAV_PRIVATE_TARGETS origin: ${entry}`);
    }
    origins.add(url.origin);
  }

  return { cidrs, origins };
}

export function assertWebDavTargetAddress(
  url: URL,
  address: string,
  policy: WebDavPrivateTargetPolicy,
) {
  const ip = parseIp(address);

  if (!ip || isHardDenied(ip)) {
    throw new Error("WebDAV target resolves to a prohibited network address");
  }
  if (!isPrivate(ip)) {
    return;
  }
  if (
    policy.origins.has(url.origin) ||
    policy.cidrs.some((range) => cidrContains(range, ip))
  ) {
    return;
  }
  throw new Error(
    "WebDAV private target is not authorized by CTN_WEBDAV_PRIVATE_TARGETS",
  );
}

export async function resolveWebDavTarget(
  url: URL,
  policy: WebDavPrivateTargetPolicy,
  lookup: WebDavDnsLookup = async (hostname) =>
    dnsLookup(hostname, { all: true, verbatim: true }),
): Promise<ResolvedWebDavTarget> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(url.hostname);

  if (addresses.length === 0) {
    throw new Error("WebDAV target hostname did not resolve");
  }

  const validated = addresses.map(({ address, family }) => {
    const parsed = parseIp(address);
    const addressFamily = isIP(address);

    if (
      !parsed ||
      (family !== 4 && family !== 6) ||
      addressFamily !== family
    ) {
      throw new Error("WebDAV target hostname returned an invalid address");
    }
    assertWebDavTargetAddress(url, address, policy);
    return { address, family: family as IpFamily };
  });

  return validated[0] as ResolvedWebDavTarget;
}
