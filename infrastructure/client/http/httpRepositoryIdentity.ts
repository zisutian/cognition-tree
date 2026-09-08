// SPDX-License-Identifier: GPL-3.0-or-later

import { resolveApiUrl } from "./apiTransport.ts";

export async function createHttpRepositoryCacheIdentity({
  baseUrl,
  repositoryId,

}: {
  baseUrl: string;
  repositoryId: string;

}) {
  const normalizedOrigin = new URL(resolveApiUrl(baseUrl, "")).origin;
  // Preserve the existing official-client cache namespace without retaining credential paths.
  const tokenDigest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  return `${normalizedOrigin}#${repositoryId}#${tokenDigest}`;
}
