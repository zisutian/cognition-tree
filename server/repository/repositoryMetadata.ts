// SPDX-License-Identifier: GPL-3.0-or-later

import {
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "../../contracts/workspace-repository/contractValue.ts";
import { parseRepositoryRevision } from "../../contracts/workspace-repository/revision.ts";
import {
  workspaceRepositorySchemaVersion,
  type RepositoryRevisionDto,
} from "../../contracts/workspace-repository/types.ts";

const metadataFields = new Set(["currentRevision", "label", "schemaVersion"]);

export type RepositoryMetadata = {
  currentRevision: RepositoryRevisionDto;
  label: string;
  schemaVersion: typeof workspaceRepositorySchemaVersion;
};

export function parseRepositoryMetadata(value: unknown): RepositoryMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WorkspaceRepositoryContractError("$", "expected object");
  }

  const metadata = value as Record<string, unknown>;

  if (metadata.schemaVersion !== workspaceRepositorySchemaVersion) {
    throw new UnsupportedRepositoryVersionError(
      "$.schemaVersion",
      metadata.schemaVersion,
    );
  }

  for (const key of Object.keys(metadata)) {
    if (!metadataFields.has(key)) {
      throw new WorkspaceRepositoryContractError(`$.${key}`, "unsupported field");
    }
  }
  for (const field of metadataFields) {
    if (!(field in metadata)) {
      throw new WorkspaceRepositoryContractError(`$.${field}`, "missing field");
    }
  }

  if (typeof metadata.label !== "string" || metadata.label.length === 0) {
    throw new WorkspaceRepositoryContractError("$.label", "expected non-empty string");
  }
  if (typeof metadata.currentRevision !== "string") {
    throw new WorkspaceRepositoryContractError("$.currentRevision", "expected string");
  }

  return {
    currentRevision: parseRepositoryRevision(
      metadata.currentRevision,
      "$.currentRevision",
    ),
    label: metadata.label,
    schemaVersion: workspaceRepositorySchemaVersion,
  };
}
