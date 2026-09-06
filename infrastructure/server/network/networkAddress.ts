// SPDX-License-Identifier: GPL-3.0-or-later

import { isIP } from "node:net";

export type NetworkAddressKind = "forbidden" | "loopback" | "private" | "public";

export function normalizeNetworkHost(value: string) {
  const host = value.trim().toLowerCase();
  return (host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host)
    .replace(/\.$/, "");
}

function classifyIpv4(octets: readonly number[]): NetworkAddressKind {
  const [first, second] = octets as [number, number, number, number];
  if (first === 127) return "loopback";
  if (first === 0 || first === 169 && second === 254 || first >= 224) return "forbidden";
  if (first === 10 || first === 100 && second >= 64 && second <= 127 ||
      first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168) return "private";
  return "public";
}

export function classifyNetworkAddress(value: string): NetworkAddressKind {
  const address = normalizeNetworkHost(value);
  const family = isIP(address);
  if (family === 4) return classifyIpv4(address.split(".").map(Number));
  if (family !== 6 || address.includes("%")) return "forbidden";
  // URL canonicalization converts an IPv4 tail to two hexadecimal words.
  const canonical = normalizeNetworkHost(new URL(`http://[${address}]`).hostname);
  const [left, right] = canonical.split("::");
  const head = left ? left.split(":").map((part) => Number.parseInt(part, 16)) : [];
  const tail = right ? right.split(":").map((part) => Number.parseInt(part, 16)) : [];
  const words = right === undefined ? head : [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail];
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return classifyIpv4([words[6]! >>> 8, words[6]! & 255, words[7]! >>> 8, words[7]! & 255]);
  }
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return "loopback";
  if (words.every((word) => word === 0) || (words[0]! & 0xffc0) === 0xfe80 ||
      (words[0]! & 0xff00) === 0xff00) return "forbidden";
  return (words[0]! & 0xfe00) === 0xfc00 ? "private" : "public";
}
