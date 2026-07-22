// SPDX-License-Identifier: GPL-3.0-or-later

export type PortableNameIssue =
  | "empty"
  | "noncanonical"
  | "unsupported-character";

const portableNamePattern = /^[\p{L}\p{M}\p{N} _-]+$/u;

export class PortableNameValidationError extends Error {
  readonly issue: PortableNameIssue;

  constructor(issue: PortableNameIssue, label = "Name") {
    const detail = issue === "empty"
      ? "must not be empty"
      : issue === "noncanonical"
        ? "must use canonical spacing and Unicode"
        : "contains unsupported characters";

    super(`${label} ${detail}.`);
    this.name = "PortableNameValidationError";
    this.issue = issue;
  }
}

/**
 * Produces the stored representation for a user-entered portable name.
 * Only ASCII spaces are collapsed so unsupported whitespace remains visible
 * to validation instead of being silently rewritten.
 */
export function normalizePortableName(value: string) {
  return value.trim().normalize("NFC").replace(/ {2,}/g, " ");
}

export function getPortableNameIssue(value: string): PortableNameIssue | null {
  const normalized = normalizePortableName(value);

  if (normalized.length === 0) {
    return "empty";
  }
  if (!portableNamePattern.test(normalized)) {
    return "unsupported-character";
  }
  return normalized === value ? null : "noncanonical";
}

export function parsePortableName(value: string, label = "Name") {
  const normalized = normalizePortableName(value);

  if (normalized.length === 0) {
    throw new PortableNameValidationError("empty", label);
  }
  if (!portableNamePattern.test(normalized)) {
    throw new PortableNameValidationError("unsupported-character", label);
  }
  return normalized;
}

/** Stable comparison/reference key for names on case-insensitive platforms. */
export function createPortableNameKey(value: string) {
  return normalizePortableName(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
}
