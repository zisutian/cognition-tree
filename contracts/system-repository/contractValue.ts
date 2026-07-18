// SPDX-License-Identifier: GPL-3.0-or-later

export class SystemRepositoryContractError extends Error {
  detail: string;
  path: string;

  constructor(path: string, message: string) {
    super(`Invalid system repository contract at ${path}: ${message}`);
    this.name = "SystemRepositoryContractError";
    this.detail = message;
    this.path = path;
  }
}

export class UnsupportedSystemRepositoryVersionError extends
  SystemRepositoryContractError {
  receivedVersion: unknown;

  constructor(path: string, receivedVersion: unknown) {
    super(path, "unsupported system repository version");
    this.name = "UnsupportedSystemRepositoryVersionError";
    this.receivedVersion = receivedVersion;
  }
}

export function failSystemContract(path: string, message: string): never {
  throw new SystemRepositoryContractError(path, message);
}

export function readSystemObject(value: unknown, path: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failSystemContract(path, "expected object");
  }
  return value as Record<string, unknown>;
}

export function assertExactSystemFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  path: string,
) {
  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) failSystemContract(`${path}.${key}`, "unsupported field");
  }
  for (const field of fields) {
    if (!(field in value)) failSystemContract(`${path}.${field}`, "missing field");
  }
}

export function readSystemString(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  if (typeof value[key] !== "string") {
    failSystemContract(`${path}.${key}`, "expected string");
  }
  return value[key] as string;
}

export function readRequiredSystemString(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const result = readSystemString(value, key, path);
  if (result.length === 0) failSystemContract(`${path}.${key}`, "expected non-empty string");
  return result;
}

export function readSystemArray(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  if (!Array.isArray(value[key])) {
    failSystemContract(`${path}.${key}`, "expected array");
  }
  return value[key] as unknown[];
}
