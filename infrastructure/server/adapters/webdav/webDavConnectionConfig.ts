// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import { isRepositoryId } from "../../../../contracts/workspace/parseCatalog.ts";
import type { RepositoryAuthenticationDto } from "../../../../contracts/workspace/types.ts";
import { normalizeWebDavBaseUrl } from "./webDavPathCodec.ts";

export const webDavConnectionConfigVersion = 1 as const;

export type ActiveWebDavConnectionConfig = {
  authentication: RepositoryAuthenticationDto;
  id: string;
  label: string;
  schemaVersion: typeof webDavConnectionConfigVersion;
  status: "active";
  url: string;
};

export type DeletingWebDavConnectionConfig = Omit<
  ActiveWebDavConnectionConfig,
  "status"
> & {
  deletionToken: string;
  startedAt: string;
  status: "deleting-remote";
};

export type WebDavConnectionConfig =
  | ActiveWebDavConnectionConfig
  | DeletingWebDavConnectionConfig;

const activeFields = new Set([
  "authentication",
  "id",
  "label",
  "schemaVersion",
  "status",
  "url",
]);
const deletingFields = new Set([
  ...activeFields,
  "deletionToken",
  "startedAt",
]);

function assertExactFields(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
) {
  if (
    Object.keys(value).some((field) => !expected.has(field)) ||
    [...expected].some((field) => !(field in value))
  ) {
    throw new Error("WebDAV connection has invalid fields");
  }
}

function parseAuthentication(value: unknown): RepositoryAuthenticationDto {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("WebDAV connection authentication is invalid");
  }
  const authentication = value as Record<string, unknown>;

  if (authentication.type === "none") {
    assertExactFields(authentication, new Set(["type"]));
    return { type: "none" };
  }
  if (authentication.type === "basic") {
    assertExactFields(
      authentication,
      new Set(["password", "type", "username"]),
    );
    if (
      typeof authentication.username !== "string" ||
      authentication.username.length === 0 ||
      typeof authentication.password !== "string" ||
      authentication.password.length === 0
    ) {
      throw new Error("WebDAV basic authentication is invalid");
    }
    return {
      password: authentication.password,
      type: "basic",
      username: authentication.username,
    };
  }
  throw new Error("WebDAV connection authentication is invalid");
}

export function parseWebDavConnectionConfig(
  source: string,
  expectedId?: string,
): WebDavConnectionConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("WebDAV connection JSON is invalid");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("WebDAV connection is invalid");
  }
  const value = parsed as Record<string, unknown>;

  if (value.schemaVersion !== webDavConnectionConfigVersion) {
    throw new Error("WebDAV connection version is unsupported");
  }
  if (value.status !== "active" && value.status !== "deleting-remote") {
    throw new Error("WebDAV connection status is invalid");
  }
  assertExactFields(
    value,
    value.status === "active" ? activeFields : deletingFields,
  );
  if (
    typeof value.id !== "string" ||
    !isRepositoryId(value.id) ||
    (expectedId !== undefined && value.id !== expectedId) ||
    typeof value.label !== "string" ||
    value.label.trim() === "" ||
    typeof value.url !== "string"
  ) {
    throw new Error("WebDAV connection identity is invalid");
  }
  const authentication = parseAuthentication(value.authentication);
  const url = normalizeWebDavBaseUrl(value.url);

  if (authentication.type === "basic" && url.protocol !== "https:") {
    throw new Error("Authenticated WebDAV connections require HTTPS");
  }
  const base = {
    authentication,
    id: value.id,
    label: value.label,
    schemaVersion: webDavConnectionConfigVersion,
    url: url.toString(),
  };

  if (value.status === "active") {
    return { ...base, status: "active" };
  }
  if (
    typeof value.deletionToken !== "string" ||
    value.deletionToken.length === 0 ||
    typeof value.startedAt !== "string" ||
    !Number.isFinite(Date.parse(value.startedAt))
  ) {
    throw new Error("WebDAV deletion state is invalid");
  }
  return {
    ...base,
    deletionToken: value.deletionToken,
    startedAt: value.startedAt,
    status: "deleting-remote",
  };
}

export function serializeWebDavConnectionConfig(
  config: WebDavConnectionConfig,
) {
  return `${serializeJsonIteratively(config, { indent: 2 })}\n`;
}
