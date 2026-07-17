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
  RepositoryAuthenticationDto,
  RepositoryAdapterKindDto,
  RepositoryApiErrorCodeDto,
  RepositoryCatalogDto,
  RepositoryCatalogIssueDto,
  RepositoryDescriptorDto,
  RepositoryDeletionModeDto,
  RepositoryDeletionResultDto,
} from "./types.ts";

const descriptorFields = ["adapter", "id", "label", "locationLabel"] as const;
const issueFields = [
  "adapter",
  "code",
  "id",
  "locationLabel",
  "message",
  "status",
] as const;
const catalogFields = ["creatableAdapters", "issues", "repositories"] as const;
const createLocalRepositoryFields = ["adapter", "content", "label"] as const;
const createWebDavRepositoryFields = [
  "adapter",
  "authentication",
  "initialContent",
  "label",
  "url",
] as const;
const authenticationNoneFields = ["type"] as const;
const authenticationBasicFields = ["password", "type", "username"] as const;
const deletionResultFields = ["status"] as const;
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
const issueStatuses = new Set<RepositoryCatalogIssueDto["status"]>([
  "deleting",
  "fault",
]);
const deletionModes = new Set<RepositoryDeletionModeDto>([
  "delete-managed-data",
  "remove-connection",
]);
const deletionStatuses = new Set<RepositoryDeletionResultDto["status"]>([
  "deleted",
  "deleting",
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

function readAdapter(
  value: Record<string, unknown>,
  key: string,
  path: string,
) {
  const adapter = readRequiredContractString(value, key, path);

  if (!adapterKinds.has(adapter as RepositoryAdapterKindDto)) {
    failContract(`${path}.${key}`, `unsupported adapter ${adapter}`);
  }

  return adapter as RepositoryAdapterKindDto;
}

export function parseRepositoryDescriptor(
  value: unknown,
  path = "$",
): RepositoryDescriptorDto {
  const descriptor = readContractObject(value, path);

  assertExactContractFields(descriptor, descriptorFields, path);
  const adapter = readAdapter(descriptor, "adapter", path);

  return {
    adapter,
    id: readRepositoryId(descriptor, path),
    label: readRequiredContractString(descriptor, "label", path),
    locationLabel: readRequiredContractString(descriptor, "locationLabel", path),
  };
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
  const status = readRequiredContractString(issue, "status", path);

  if (!issueCodes.has(code as RepositoryCatalogIssueDto["code"])) {
    failContract(`${path}.code`, `unsupported catalog issue code ${code}`);
  }
  if (!issueStatuses.has(status as RepositoryCatalogIssueDto["status"])) {
    failContract(`${path}.status`, `unsupported catalog issue status ${status}`);
  }

  return {
    adapter: readAdapter(issue, "adapter", path),
    code: code as RepositoryCatalogIssueDto["code"],
    id: readRepositoryId(issue, path),
    locationLabel: readRequiredContractString(issue, "locationLabel", path),
    message: readRequiredContractString(issue, "message", path),
    status: status as RepositoryCatalogIssueDto["status"],
  };
}

export function parseRepositoryCatalog(value: unknown): RepositoryCatalogDto {
  const catalog = readContractObject(value, "$");

  assertExactContractFields(catalog, catalogFields, "$");
  const creatableAdapters = readContractArray(
    catalog,
    "creatableAdapters",
    "$",
  ).map((adapter, index) => {
    if (
      typeof adapter !== "string" ||
      !adapterKinds.has(adapter as RepositoryAdapterKindDto)
    ) {
      failContract(
        `$.creatableAdapters[${index}]`,
        `unsupported adapter ${String(adapter)}`,
      );
    }

    return adapter as RepositoryAdapterKindDto;
  });
  if (new Set(creatableAdapters).size !== creatableAdapters.length) {
    failContract("$.creatableAdapters", "duplicate adapter");
  }
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

  return { creatableAdapters, issues, repositories };
}

export function parseCreateRepository(value: unknown): CreateRepositoryDto {
  const request = readContractObject(value, "$");
  const adapter = readRequiredContractString(request, "adapter", "$");

  if (adapter === "local") {
    assertExactContractFields(request, createLocalRepositoryFields, "$");
    return {
      adapter,
      content: parseWorkspaceRepositoryContent(request.content),
      label: readRequiredContractString(request, "label", "$"),
    };
  }
  if (adapter === "webdav") {
    assertExactContractFields(request, createWebDavRepositoryFields, "$");
    return {
      adapter,
      authentication: parseRepositoryAuthentication(request.authentication),
      initialContent: parseWorkspaceRepositoryContent(request.initialContent),
      label: readRequiredContractString(request, "label", "$"),
      url: readRequiredContractString(request, "url", "$"),
    };
  }

  failContract("$.adapter", `unsupported create adapter ${adapter}`);
}

function parseRepositoryAuthentication(
  value: unknown,
): RepositoryAuthenticationDto {
  const authentication = readContractObject(value, "$.authentication");
  const type = readRequiredContractString(
    authentication,
    "type",
    "$.authentication",
  );

  if (type === "none") {
    assertExactContractFields(
      authentication,
      authenticationNoneFields,
      "$.authentication",
    );
    return { type };
  }
  if (type === "basic") {
    assertExactContractFields(
      authentication,
      authenticationBasicFields,
      "$.authentication",
    );
    return {
      password: readRequiredContractString(
        authentication,
        "password",
        "$.authentication",
      ),
      type,
      username: readRequiredContractString(
        authentication,
        "username",
        "$.authentication",
      ),
    };
  }

  failContract(
    "$.authentication.type",
    `unsupported authentication type ${type}`,
  );
}

export function parseRepositoryDeletionMode(
  value: unknown,
): RepositoryDeletionModeDto {
  if (
    typeof value !== "string" ||
    !deletionModes.has(value as RepositoryDeletionModeDto)
  ) {
    failContract(
      "$.mode",
      `unsupported repository deletion mode ${String(value)}`,
    );
  }

  return value as RepositoryDeletionModeDto;
}

export function parseRepositoryDeletionResult(
  value: unknown,
): RepositoryDeletionResultDto {
  const result = readContractObject(value, "$");

  assertExactContractFields(result, deletionResultFields, "$");
  const status = readRequiredContractString(result, "status", "$");

  if (!deletionStatuses.has(status as RepositoryDeletionResultDto["status"])) {
    failContract("$.status", `unsupported repository deletion status ${status}`);
  }

  return { status: status as RepositoryDeletionResultDto["status"] };
}
