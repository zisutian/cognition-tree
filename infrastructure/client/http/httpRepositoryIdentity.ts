// SPDX-License-Identifier: GPL-3.0-or-later

import { resolveApiUrl } from "./apiTransport";

export async function createHttpRepositoryCacheIdentity({
  baseUrl,
  repositoryId,
  token,
}: {
  baseUrl: string;
  repositoryId: string;
  token?: string;
}) {
  const normalizedOrigin = new URL(resolveApiUrl(baseUrl, "")).origin;
  const tokenBytes = new TextEncoder().encode(token ?? "");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", tokenBytes);
  const tokenDigest = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return `${normalizedOrigin}#${repositoryId}#${tokenDigest}`;
}
