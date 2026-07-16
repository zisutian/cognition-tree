// SPDX-License-Identifier: GPL-3.0-or-later

import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../../contracts/workspace-repository/contractValue.ts";
import { serializeJsonIteratively } from "../../../contracts/workspace-repository/json.ts";
import { parseRepositoryRevision } from "../../../contracts/workspace-repository/revision.ts";
import {
  workspaceRepositorySchemaVersion,
  type RepositoryRevisionDto,
} from "../../../contracts/workspace-repository/types.ts";
import { RepositoryCorruptError } from "../../repository/repositoryStore.ts";
import {
  WebDavCapabilityError,
  type WebDavTextResource,
  type WebDavTransport,
} from "./webDavTransport.ts";

export const webDavGenerationsPath = ".ctn-generations";
export const webDavCurrentPath = ".ctn-current.json";
export const webDavLockPath = ".ctn-lock.json";

export type WebDavPointer = {
  generation: string;
  publishedAt: string;
  revision: RepositoryRevisionDto;
  schemaVersion: typeof workspaceRepositorySchemaVersion;
};

export type WebDavLease = {
  expiresAt: string;
  schemaVersion: typeof workspaceRepositorySchemaVersion;
  token: string;
};

export function stringifyWebDavControlFile(value: unknown) {
  return `${serializeJsonIteratively(value, { indent: 2 })}\n`;
}

function parseObject(source: string, label: string) {
  let value: unknown;

  try {
    value = JSON.parse(source);
  } catch {
    throw new RepositoryCorruptError(`WebDAV ${label} is invalid`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RepositoryCorruptError(`WebDAV ${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  label: string,
) {
  const expected = new Set(fields);

  if (
    Object.keys(value).some((field) => !expected.has(field)) ||
    fields.some((field) => !(field in value))
  ) {
    throw new RepositoryCorruptError(`WebDAV ${label} has invalid fields`);
  }
}

export function parseWebDavPointer(resource: WebDavTextResource): WebDavPointer {
  const value = parseObject(resource.source, "current pointer");

  if (value.schemaVersion !== workspaceRepositorySchemaVersion) {
    throw new UnsupportedRepositoryVersionError("$.schemaVersion", value.schemaVersion);
  }
  assertExactFields(
    value,
    ["generation", "publishedAt", "revision", "schemaVersion"],
    "current pointer",
  );
  if (
    typeof value.generation !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.generation)
  ) {
    throw new RepositoryCorruptError("WebDAV current pointer has invalid generation");
  }
  if (
    typeof value.publishedAt !== "string" ||
    !Number.isFinite(Date.parse(value.publishedAt))
  ) {
    throw new RepositoryCorruptError("WebDAV current pointer has invalid timestamp");
  }
  if (typeof value.revision !== "string") {
    throw new RepositoryCorruptError("WebDAV current pointer has invalid revision");
  }

  try {
    return {
      generation: value.generation,
      publishedAt: value.publishedAt,
      revision: parseRepositoryRevision(value.revision, "$.revision"),
      schemaVersion: workspaceRepositorySchemaVersion,
    };
  } catch (error) {
    if (error instanceof WorkspaceRepositoryContractError) {
      throw new RepositoryCorruptError("WebDAV current pointer has invalid revision");
    }
    throw error;
  }
}

export function parseWebDavLease(resource: WebDavTextResource): WebDavLease {
  const value = parseObject(resource.source, "writer lease");

  if (value.schemaVersion !== workspaceRepositorySchemaVersion) {
    throw new UnsupportedRepositoryVersionError("$.schemaVersion", value.schemaVersion);
  }
  assertExactFields(value, ["expiresAt", "schemaVersion", "token"], "writer lease");
  if (
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    typeof value.token !== "string" ||
    value.token.length === 0
  ) {
    throw new RepositoryCorruptError("WebDAV writer lease is invalid");
  }

  return {
    expiresAt: value.expiresAt,
    schemaVersion: workspaceRepositorySchemaVersion,
    token: value.token,
  };
}

export function createWebDavPointer(
  generation: string,
  revision: RepositoryRevisionDto,
  now: number,
): WebDavPointer {
  return {
    generation,
    publishedAt: new Date(now).toISOString(),
    revision,
    schemaVersion: workspaceRepositorySchemaVersion,
  };
}

export function createWebDavLease(token: string, expiresAt: number): WebDavLease {
  return {
    expiresAt: new Date(expiresAt).toISOString(),
    schemaVersion: workspaceRepositorySchemaVersion,
    token,
  };
}

export function requireWebDavEtag(resource: WebDavTextResource, label: string) {
  if (!resource.etag) {
    throw new WebDavCapabilityError(`WebDAV ${label} has no ETag`);
  }
  return resource.etag;
}

export async function requireWebDavPointerResource(transport: WebDavTransport) {
  const resource = await transport.readText(webDavCurrentPath);

  if (!resource) {
    throw new RepositoryCorruptError("WebDAV current pointer is missing");
  }
  requireWebDavEtag(resource, "current pointer");
  return resource;
}
