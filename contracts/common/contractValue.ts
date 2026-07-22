// SPDX-License-Identifier: GPL-3.0-or-later

export class WireContractError extends Error {
  readonly contract: string;
  readonly detail: string;
  readonly path: string;

  constructor(contract: string, path: string, message: string) {
    super(`Invalid ${contract} contract at ${path}: ${message}`);
    this.name = "WireContractError";
    this.contract = contract;
    this.detail = message;
    this.path = path;
  }
}

export class UnsupportedWireVersionError extends WireContractError {
  readonly receivedVersion: unknown;

  constructor(contract: string, path: string, receivedVersion: unknown) {
    super(contract, path, "unsupported content version");
    this.name = "UnsupportedWireVersionError";
    this.receivedVersion = receivedVersion;
  }
}

export function failWireContract(
  contract: string,
  path: string,
  message: string,
): never {
  throw new WireContractError(contract, path, message);
}

export function readWireObject(
  contract: string,
  value: unknown,
  path: string,
) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failWireContract(contract, path, "expected object");
  }
  return value as Record<string, unknown>;
}

export function assertExactWireFields(
  contract: string,
  value: Record<string, unknown>,
  fields: readonly string[],
  path: string,
) {
  const expected = new Set(fields);

  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      failWireContract(contract, `${path}.${key}`, "unsupported field");
    }
  }
  for (const field of fields) {
    if (!(field in value)) {
      failWireContract(contract, `${path}.${field}`, "missing field");
    }
  }
}

export function readWireString(
  contract: string,
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  if (typeof value[key] !== "string") {
    failWireContract(contract, `${path}.${key}`, "expected string");
  }
  return value[key] as string;
}

export function readRequiredWireString(
  contract: string,
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const result = readWireString(contract, value, key, path);

  if (result.length === 0) {
    failWireContract(contract, `${path}.${key}`, "expected non-empty string");
  }
  return result;
}

export function readWireArray(
  contract: string,
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  if (!Array.isArray(value[key])) {
    failWireContract(contract, `${path}.${key}`, "expected array");
  }
  return value[key] as unknown[];
}

const revisionPattern = /^sha256:[0-9a-f]{64}$/;

export function parseContentRevision(value: unknown, path = "$") {
  if (typeof value !== "string" || !revisionPattern.test(value)) {
    failWireContract("versioned content", path, "expected sha256 revision");
  }
  return value as `sha256:${string}`;
}

export function readCanonicalTimestamp(
  contract: string,
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const timestamp = readRequiredWireString(contract, value, key, path);
  const milliseconds = Date.parse(timestamp);

  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    failWireContract(contract, `${path}.${key}`, "expected canonical timestamp");
  }
  return timestamp;
}
