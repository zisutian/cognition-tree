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
  RepositoryAdapterKindDto,
  RepositoryApiErrorCodeDto,
  RepositoryCatalogDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
} from "./types.ts";

const descriptorFields = ["adapter", "id", "label", "locationLabel"] as const;
const issueFields = ["code", "id", "locationLabel", "message"] as const;
const catalogFields = ["issues", "repositories"] as const;
const createRepositoryFields = ["content", "id", "label"] as const;
const adapterKinds = new Set<RepositoryAdapterKindDto>([
  "browser",
  "local",
  "webdav",
]);
const issueCodes = new Set<RepositoryCatalogIssueDto["code"]>([
  "adapter_unavailable",
  "repository_busy",
  "repository_corrupt",
  "unsupported_repository_version",
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

export function parseRepositoryDescriptor(
  value: unknown,
  path = "$",
): RepositoryDescriptorDto {
  const descriptor = readContractObject(value, path);

  assertExactContractFields(descriptor, descriptorFields, path);
  const adapter = readRequiredContractString(descriptor, "adapter", path);

  if (!adapterKinds.has(adapter as RepositoryAdapterKindDto)) {
    failContract(`${path}.adapter`, `unsupported adapter ${adapter}`);
  }

  return {
    adapter: adapter as RepositoryAdapterKindDto,
    id: readRepositoryId(descriptor, path),
    label: readRequiredContractString(descriptor, "label", path),
    locationLabel: readRequiredContractString(descriptor, "locationLabel", path),
  };
}

function parseCatalogIssue(value: unknown, path: string): RepositoryCatalogIssueDto {
  const issue = readContractObject(value, path);

  assertExactContractFields(issue, issueFields, path);
  const code = readRequiredContractString(issue, "code", path) as RepositoryApiErrorCodeDto;

  if (!issueCodes.has(code as RepositoryCatalogIssueDto["code"])) {
    failContract(`${path}.code`, `unsupported catalog issue code ${code}`);
  }

  return {
    code: code as RepositoryCatalogIssueDto["code"],
    id: readRepositoryId(issue, path),
    locationLabel: readRequiredContractString(issue, "locationLabel", path),
    message: readRequiredContractString(issue, "message", path),
  };
}

export function parseRepositoryCatalog(value: unknown): RepositoryCatalogDto {
  const catalog = readContractObject(value, "$");

  assertExactContractFields(catalog, catalogFields, "$");
  const repositories = readContractArray(catalog, "repositories", "$" ).map(
    (descriptor, index) =>
      parseRepositoryDescriptor(descriptor, `$.repositories[${index}]`),
  );
  const issues = readContractArray(catalog, "issues", "$" ).map(
    (issue, index) => parseCatalogIssue(issue, `$.issues[${index}]`),
  );
  const ids = new Set<string>();

  repositories.forEach((entry, index) => {
    if (ids.has(entry.id)) {
      failContract(`$.repositories[${index}].id`, `duplicate repository id ${entry.id}`);
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
    id: readRepositoryId(request, "$"),
    label: readRequiredContractString(request, "label", "$"),
  };
}
