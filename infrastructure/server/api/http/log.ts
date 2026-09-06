// SPDX-License-Identifier: GPL-3.0-or-later

function redactLogText(source: string) {
  const repositoryId = String.raw`repository-[a-z0-9]+(?:-[a-z0-9]+)*`;
  const quotedRepositoryPath = new RegExp(
    String.raw`(["'\x60])((?:[A-Za-z]:[\\/]|/)(?:[^"'\x60\r\n]*[\\/])?${repositoryId}(?:[\\/][^"'\x60\r\n]*)?)\1`,
    "gi",
  );
  const unquotedRepositoryPath = new RegExp(
    String.raw`(?:[A-Za-z]:[\\/]|/)(?:[^\s"'\x60\r\n]*[\\/])?${repositoryId}(?:[\\/][^\s"'\x60\r\n]*)?`,
    "gi",
  );

  return source
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
    .replace(/(https?:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(quotedRepositoryPath, "$1[repository-path]$1")
    .replace(unquotedRepositoryPath, "[repository-path]");
}

export function createSafeApiLogError(error: unknown) {
  if (!(error instanceof Error)) {
    return new Error(redactLogText(String(error)));
  }
  const safe = new Error(redactLogText(error.message));

  safe.name = error.name;
  if (error.stack) safe.stack = redactLogText(error.stack);
  return safe;
}

export function reportApiRequestFailure(
  logger: Pick<Console, "error">,
  requestId: string,
  error: unknown,
) {
  try {
    logger.error(
      `[${requestId}] CTN API v4 request failed`,
      createSafeApiLogError(error),
    );
  } catch {
    // Logging is observational and must not replace the API error response.
  }
}
