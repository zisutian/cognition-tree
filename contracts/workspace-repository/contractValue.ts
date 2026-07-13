// SPDX-License-Identifier: GPL-3.0-or-later

export class WorkspaceRepositoryContractError extends Error {
  detail: string;
  path: string;

  constructor(path: string, message: string) {
    super(`Invalid repository contract at ${path}: ${message}`);
    this.name = "WorkspaceRepositoryContractError";
    this.detail = message;
    this.path = path;
  }
}

export function failContract(path: string, message: string): never {
  throw new WorkspaceRepositoryContractError(path, message);
}

export function readContractObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    failContract(path, "expected object");
  }

  return value as Record<string, unknown>;
}

export function assertExactContractFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  path: string,
) {
  const expectedFields = new Set(fields);

  for (const key of Object.keys(value)) {
    if (!expectedFields.has(key)) {
      failContract(`${path}.${key}`, "unsupported field");
    }
  }

  for (const field of fields) {
    if (!(field in value)) {
      failContract(`${path}.${field}`, "missing field");
    }
  }
}

export function readContractString(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const field = value[key];

  if (typeof field !== "string") {
    failContract(`${path}.${key}`, "expected string");
  }

  return field;
}

export function readRequiredContractString(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const field = readContractString(value, key, path);

  if (field.length === 0) {
    failContract(`${path}.${key}`, "expected non-empty string");
  }

  return field;
}

export function readContractArray(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const field = value[key];

  if (!Array.isArray(field)) {
    failContract(`${path}.${key}`, "expected array");
  }

  return field;
}
