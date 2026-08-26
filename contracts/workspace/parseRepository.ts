// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactContractFields,
  readContractObject,
  readRequiredContractString,
  UnsupportedRepositoryVersionError,
  WorkspaceRepositoryContractError,
} from "./contractValue.ts";
import { parseRepositoryRevision } from "./revision.ts";
import { parseRepositorySyntaxCatalog } from "./parseSyntax.ts";
import { parseRepositoryWorkspace } from "./parseWorkspace.ts";
import {
  workspaceRepositorySchemaVersion,
  type WorkspaceRepositoryContentDto,
  type WorkspaceRepositorySnapshotDto,
  type WorkspaceRepositorySyncRequestDto,
  type WorkspaceRepositorySyncResultDto,
} from "./types.ts";

const contentFields = ["schemaVersion", "syntax", "workspace"] as const;
const snapshotFields = ["content", "revision"] as const;
const syncRequestFields = ["base", "content"] as const;
const syncResultFields = ["outcome", "snapshot"] as const;

function parseContentAtPath(
  value: unknown,
  path: string,
): WorkspaceRepositoryContentDto {
  const content = readContractObject(value, path);

  if (content.schemaVersion !== workspaceRepositorySchemaVersion) {
    throw new UnsupportedRepositoryVersionError(
      `${path}.schemaVersion`,
      content.schemaVersion,
    );
  }

  assertExactContractFields(content, contentFields, path);
  return {
    schemaVersion: workspaceRepositorySchemaVersion,
    syntax: parseRepositorySyntaxCatalog(content.syntax, `${path}.syntax`),
    workspace: parseRepositoryWorkspace(content.workspace, `${path}.workspace`),
  };
}

export function parseWorkspaceRepositoryContent(
  value: unknown,
): WorkspaceRepositoryContentDto {
  return parseContentAtPath(value, "$");
}

export function parseWorkspaceRepositorySnapshot(
  value: unknown,
): WorkspaceRepositorySnapshotDto {
  const snapshot = readContractObject(value, "$");

  assertExactContractFields(snapshot, snapshotFields, "$");
  return {
    content: parseContentAtPath(snapshot.content, "$.content"),
    revision: parseRepositoryRevision(
      readRequiredContractString(snapshot, "revision", "$"),
      "$.revision",
    ),
  };
}

export function parseWorkspaceRepositorySyncRequest(
  value: unknown,
): WorkspaceRepositorySyncRequestDto {
  const request = readContractObject(value, "$");

  assertExactContractFields(request, syncRequestFields, "$");

  return {
    base: parseWorkspaceRepositorySnapshot(request.base),
    content: parseContentAtPath(request.content, "$.content"),
  };
}

export function parseWorkspaceRepositorySyncResult(
  value: unknown,
): WorkspaceRepositorySyncResultDto {
  const result = readContractObject(value, "$");

  assertExactContractFields(result, syncResultFields, "$");
  const outcome = readRequiredContractString(result, "outcome", "$");

  if (
    outcome !== "auto-merged" && outcome !== "committed" &&
    outcome !== "unchanged"
  ) {
    throw new WorkspaceRepositoryContractError(
      "$.outcome",
      "expected sync outcome",
    );
  }
  return {
    outcome,
    snapshot: parseWorkspaceRepositorySnapshot(result.snapshot),
  };
}
