// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactContractFields,
  failContract,
  readContractArray,
  readContractObject,
  readRequiredContractString,
} from "./contractValue.ts";
import { parseWorkspaceRepositoryContent } from "./parseRepository.ts";
import type {
  CreateRepositoryDto,
  RepositoryApiErrorCodeDto,
  RepositoryCatalogDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
  RepositoryLocationDto,
  RenameRepositoryDto,
} from "./types.ts";

const descriptorFields = [
  "id",
  "label",
  "labelIssue",
  "location",
] as const;
const issueFields = [
  "code",
  "id",
  "location",
  "message",
] as const;
const locationFields = ["hostPath", "serverPath"] as const;
const catalogFields = ["issues", "repositories"] as const;
const createRepositoryFields = ["content", "label"] as const;
const renameRepositoryFields = ["label"] as const;
const issueCodes = new Set<RepositoryCatalogIssueDto["code"]>([
  "adapter_unavailable",
  "repository_busy",
  "repository_corrupt",
  "unsupported_repository_version",
]);
const labelIssues = new Set<NonNullable<RepositoryDescriptorDto["labelIssue"]>>([
  "conflict",
  "nonportable",
  "reserved",
]);

export function isRepositoryId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

function readRepositoryId(value: Record<string, unknown>, path: string) {
  const id = readRequiredContractString(value, "id", path);

  if (!isRepositoryId(id)) {
    failContract(`${path}.id`, "invalid repository id");
  }

  return id;
}

function parseRepositoryLocation(
  value: unknown,
  path: string,
): RepositoryLocationDto {
  const location = readContractObject(value, path);
  assertExactContractFields(location, locationFields, path);
  const hostPath = location.hostPath;
  const serverPath = readRequiredContractString(location, "serverPath", path);
  const isAbsolutePath = (candidate: string) =>
    !candidate.includes("\0") &&
    (/^\//.test(candidate) || /^[A-Za-z]:[\\/]/.test(candidate) || /^\\\\/.test(candidate));

  if (
    hostPath !== null &&
    (typeof hostPath !== "string" || !isAbsolutePath(hostPath))
  ) {
    failContract(`${path}.hostPath`, "expected null or an absolute path");
  }
  if (!isAbsolutePath(serverPath)) {
    failContract(`${path}.serverPath`, "expected an absolute path");
  }
  return { hostPath, serverPath };
}

function readRepositoryLocation(
  value: Record<string, unknown>,
  path: string,
): RepositoryLocationDto;
function readRepositoryLocation(
  value: Record<string, unknown>,
  path: string,
  options: { nullable: true },
): RepositoryLocationDto | null;
function readRepositoryLocation(
  value: Record<string, unknown>,
  path: string,
  { nullable = false }: { nullable?: boolean } = {},
): RepositoryLocationDto | null {
  const locationValue = value.location;

  if (nullable && locationValue === null) {
    return null;
  }
  return parseRepositoryLocation(locationValue, `${path}.location`);
}

export function parseRepositoryDescriptor(
  value: unknown,
  path = "$",
): RepositoryDescriptorDto {
  const descriptor = readContractObject(value, path);

  assertExactContractFields(descriptor, descriptorFields, path);
  const labelIssue = descriptor.labelIssue;
  if (
    labelIssue !== null &&
    (typeof labelIssue !== "string" ||
      !labelIssues.has(labelIssue as NonNullable<RepositoryDescriptorDto["labelIssue"]>))
  ) {
    failContract(`${path}.labelIssue`, "expected null or a supported label issue");
  }

  return {
    id: readRepositoryId(descriptor, path),
    label: readRequiredContractString(descriptor, "label", path),
    labelIssue: labelIssue as RepositoryDescriptorDto["labelIssue"],
    location: readRepositoryLocation(descriptor, path),
  };
}

function readRepositoryLabel(
  value: Record<string, unknown>,
  path: string,
) {
  return readRequiredContractString(value, "label", path);
}

export function parseRenameRepository(value: unknown): RenameRepositoryDto {
  const request = readContractObject(value, "$"),
    label = readRepositoryLabel(request, "$");
  assertExactContractFields(request, renameRepositoryFields, "$");
  return { label };
}

function parseCatalogIssue(
  value: unknown,
  path: string,
): RepositoryCatalogIssueDto {
  const issue = readContractObject(value, path);

  assertExactContractFields(issue, issueFields, path);
  const code = readRequiredContractString(
    issue,
    "code",
    path,
  ) as RepositoryApiErrorCodeDto;

  if (!issueCodes.has(code as RepositoryCatalogIssueDto["code"])) {
    failContract(`${path}.code`, `unsupported catalog issue code ${code}`);
  }

  return {
    code: code as RepositoryCatalogIssueDto["code"],
    id: readRepositoryId(issue, path),
    location: readRepositoryLocation(issue, path, { nullable: true }),
    message: readRequiredContractString(issue, "message", path),
  };
}

export function parseRepositoryCatalog(value: unknown): RepositoryCatalogDto {
  const catalog = readContractObject(value, "$");

  assertExactContractFields(catalog, catalogFields, "$");
  const repositories = readContractArray(catalog, "repositories", "$").map(
    (descriptor, index) =>
      parseRepositoryDescriptor(descriptor, `$.repositories[${index}]`),
  );
  const issues = readContractArray(catalog, "issues", "$").map(
    (issue, index) => parseCatalogIssue(issue, `$.issues[${index}]`),
  );
  const ids = new Set<string>();

  repositories.forEach((entry, index) => {
    if (ids.has(entry.id)) {
      failContract(
        `$.repositories[${index}].id`,
        `duplicate repository id ${entry.id}`,
      );
    }
    ids.add(entry.id);
  });
  issues.forEach((entry, index) => {
    if (ids.has(entry.id)) {
      failContract(`$.issues[${index}].id`, `duplicate repository id ${entry.id}`);
    }
    ids.add(entry.id);
  });

  return { issues, repositories };
}

export function parseCreateRepository(value: unknown): CreateRepositoryDto {
  const request = readContractObject(value, "$");
  assertExactContractFields(request, createRepositoryFields, "$");
  return {
    content: parseWorkspaceRepositoryContent(request.content),
    label: readRepositoryLabel(request, "$"),
  };
}
