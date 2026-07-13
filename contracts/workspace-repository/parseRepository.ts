// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactContractFields,
  failContract,
  readContractObject,
  readContractString,
  readRequiredContractString,
} from "./contractValue.ts";
import { parseRepositoryWorkspace } from "./parseWorkspace.ts";
import {
  repositorySyntaxFileName,
  type RepositorySyntaxSourceDto,
  type WorkspaceRepositoryCommitDto,
  type WorkspaceRepositoryCommitResultDto,
  type WorkspaceRepositoryContentDto,
  type WorkspaceRepositorySnapshotDto,
} from "./types.ts";

const contentFields = ["syntaxSourceFile", "workspace"] as const;
const snapshotFields = [
  "repositoryPath",
  "revision",
  "syntaxSourceFile",
  "workspace",
] as const;
const commitFields = [
  "baseRevision",
  "syntaxSourceFile",
  "workspace",
] as const;
const commitResultFields = ["revision"] as const;
const syntaxSourceFields = ["fileName", "source"] as const;

function parseSyntaxSource(
  value: unknown,
  path: string,
): RepositorySyntaxSourceDto | null {
  if (value === null) {
    return null;
  }

  const syntaxSource = readContractObject(value, path);

  assertExactContractFields(syntaxSource, syntaxSourceFields, path);

  const fileName = readRequiredContractString(
    syntaxSource,
    "fileName",
    path,
  );

  if (fileName !== repositorySyntaxFileName) {
    failContract(
      `${path}.fileName`,
      `expected ${repositorySyntaxFileName}`,
    );
  }

  return {
    fileName,
    source: readContractString(syntaxSource, "source", path),
  };
}

function parseContentFields(
  value: Record<string, unknown>,
  path: string,
): WorkspaceRepositoryContentDto {
  return {
    syntaxSourceFile: parseSyntaxSource(
      value.syntaxSourceFile,
      `${path}.syntaxSourceFile`,
    ),
    workspace: parseRepositoryWorkspace(
      value.workspace,
      `${path}.workspace`,
    ),
  };
}

export function parseWorkspaceRepositoryContent(
  value: unknown,
): WorkspaceRepositoryContentDto {
  const content = readContractObject(value, "$");

  assertExactContractFields(content, contentFields, "$");
  return parseContentFields(content, "$");
}

export function parseWorkspaceRepositorySnapshot(
  value: unknown,
): WorkspaceRepositorySnapshotDto {
  const snapshot = readContractObject(value, "$");

  assertExactContractFields(snapshot, snapshotFields, "$");

  return {
    ...parseContentFields(snapshot, "$"),
    repositoryPath: readRequiredContractString(
      snapshot,
      "repositoryPath",
      "$",
    ),
    revision: readRequiredContractString(snapshot, "revision", "$"),
  };
}

export function parseWorkspaceRepositoryCommit(
  value: unknown,
): WorkspaceRepositoryCommitDto {
  const commit = readContractObject(value, "$");

  assertExactContractFields(commit, commitFields, "$");
  const content = parseContentFields(commit, "$");

  if (
    content.syntaxSourceFile !== null &&
    content.syntaxSourceFile.source.trim().length === 0
  ) {
    failContract(
      "$.syntaxSourceFile.source",
      "expected non-empty syntax source",
    );
  }

  return {
    ...content,
    baseRevision: readRequiredContractString(commit, "baseRevision", "$"),
  };
}

export function parseWorkspaceRepositoryCommitResult(
  value: unknown,
): WorkspaceRepositoryCommitResultDto {
  const result = readContractObject(value, "$");

  assertExactContractFields(result, commitResultFields, "$");
  return {
    revision: readRequiredContractString(result, "revision", "$"),
  };
}
