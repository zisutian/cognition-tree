// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactContractFields,
  readContractObject,
  readContractString,
  readRequiredContractString,
  UnsupportedRepositoryVersionError,
} from "./contractValue.ts";
import { parseRepositoryRevision } from "./revision.ts";
import { parseRepositoryWorkspace } from "./parseWorkspace.ts";
import {
  workspaceRepositorySchemaVersion,
  type WorkspaceRepositoryCommitDto,
  type WorkspaceRepositoryCommitResultDto,
  type WorkspaceRepositoryContentDto,
  type WorkspaceRepositorySnapshotDto,
} from "./types.ts";

const contentFields = ["schemaVersion", "syntaxSource", "workspace"] as const;
const snapshotFields = ["content", "revision"] as const;
const commitFields = ["baseRevision", "content"] as const;
const commitResultFields = ["revision"] as const;

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
  const syntaxSource = content.syntaxSource === null
    ? null
    : readContractString(content, "syntaxSource", path);

  return {
    schemaVersion: workspaceRepositorySchemaVersion,
    syntaxSource,
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

  if (!("content" in snapshot) && ("workspace" in snapshot || "syntaxSourceFile" in snapshot)) {
    throw new UnsupportedRepositoryVersionError("$.content.schemaVersion", undefined);
  }

  assertExactContractFields(snapshot, snapshotFields, "$");
  return {
    content: parseContentAtPath(snapshot.content, "$.content"),
    revision: parseRepositoryRevision(
      readRequiredContractString(snapshot, "revision", "$"),
      "$.revision",
    ),
  };
}

export function parseWorkspaceRepositoryCommit(
  value: unknown,
): WorkspaceRepositoryCommitDto {
  const commit = readContractObject(value, "$");

  if (!("content" in commit) && ("workspace" in commit || "syntaxSourceFile" in commit)) {
    throw new UnsupportedRepositoryVersionError("$.content.schemaVersion", undefined);
  }

  assertExactContractFields(commit, commitFields, "$");
  const content = parseContentAtPath(commit.content, "$.content");

  return {
    baseRevision: parseRepositoryRevision(
      readRequiredContractString(commit, "baseRevision", "$"),
      "$.baseRevision",
    ),
    content,
  };
}

export function parseWorkspaceRepositoryCommitResult(
  value: unknown,
): WorkspaceRepositoryCommitResultDto {
  const result = readContractObject(value, "$");

  assertExactContractFields(result, commitResultFields, "$");
  return {
    revision: parseRepositoryRevision(
      readRequiredContractString(result, "revision", "$"),
      "$.revision",
    ),
  };
}
