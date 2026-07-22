// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactContractFields,
  failContract,
  readContractArray,
  readContractObject,
  readRequiredContractString,
} from "./contractValue.ts";
import { parseWorkspaceRepositoryContent } from "./parseRepository.ts";
import { parsePortableName } from "../../portable-name/portableName.ts";
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
  RepositoryLocationDto,
  RenameRepositoryDto,
} from "./types.ts";

const descriptorFields = [
  "adapter",
  "id",
  "label",
  "labelIssue",
  "location",
] as const;
const issueFields = [
  "adapter",
  "code",
  "id",
  "location",
  "message",
  "status",
] as const;
const localLocationFields = ["hostPath", "serverPath", "type"] as const;
const webDavLocationFields = ["type", "url"] as const;
const browserLocationFields = ["databaseName", "type"] as const;
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
const renameRepositoryFields = ["label"] as const;
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
const labelIssues = new Set<NonNullable<RepositoryDescriptorDto["labelIssue"]>>([
  "conflict",
  "nonportable",
  "reserved",
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

function parseRepositoryLocation(
  value: unknown,
  path: string,
): RepositoryLocationDto {
  const location = readContractObject(value, path);
  const type = readRequiredContractString(location, "type", path);

  if (type === "local") {
    assertExactContractFields(location, localLocationFields, path);
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
    return {
      hostPath,
      serverPath,
      type,
    };
  }
  if (type === "webdav") {
    assertExactContractFields(location, webDavLocationFields, path);
    const source = readRequiredContractString(location, "url", path);
    let url: URL;

    try {
      url = new URL(source);
    } catch {
      failContract(`${path}.url`, "expected an absolute WebDAV URL");
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.toString() !== source
    ) {
      failContract(
        `${path}.url`,
        "expected a canonical WebDAV URL without credentials, query, or fragment",
      );
    }
    return {
      type,
      url: source,
    };
  }
  if (type === "browser") {
    assertExactContractFields(location, browserLocationFields, path);
    return {
      databaseName: readRequiredContractString(location, "databaseName", path),
      type,
    };
  }

  failContract(`${path}.type`, `unsupported location type ${type}`);
}

function readRepositoryLocation(
  value: Record<string, unknown>,
  adapter: RepositoryAdapterKindDto,
  path: string,
): RepositoryLocationDto;
function readRepositoryLocation(
  value: Record<string, unknown>,
  adapter: RepositoryAdapterKindDto,
  path: string,
  options: { nullable: true },
): RepositoryLocationDto | null;
function readRepositoryLocation(
  value: Record<string, unknown>,
  adapter: RepositoryAdapterKindDto,
  path: string,
  { nullable = false }: { nullable?: boolean } = {},
): RepositoryLocationDto | null {
  const locationValue = value.location;

  if (nullable && locationValue === null) {
    return null;
  }
  const location = parseRepositoryLocation(locationValue, `${path}.location`);

  if (location.type !== adapter) {
    failContract(
      `${path}.location.type`,
      `location type ${location.type} does not match adapter ${adapter}`,
    );
  }
  return location;
}

export function parseRepositoryDescriptor(
  value: unknown,
  path = "$",
): RepositoryDescriptorDto {
  const descriptor = readContractObject(value, path);

  assertExactContractFields(descriptor, descriptorFields, path);
  const adapter = readAdapter(descriptor, "adapter", path);
  const labelIssue = descriptor.labelIssue;
  if (
    labelIssue !== null &&
    (typeof labelIssue !== "string" ||
      !labelIssues.has(labelIssue as NonNullable<RepositoryDescriptorDto["labelIssue"]>))
  ) {
    failContract(`${path}.labelIssue`, "expected null or a supported label issue");
  }

  return {
    adapter,
    id: readRepositoryId(descriptor, path),
    label: readRequiredContractString(descriptor, "label", path),
    labelIssue: labelIssue as RepositoryDescriptorDto["labelIssue"],
    location: readRepositoryLocation(descriptor, adapter, path),
  };
}

function readPortableRepositoryLabel(
  value: Record<string, unknown>,
  path: string,
) {
  const label = readRequiredContractString(value, "label", path);

  try {
    return parsePortableName(label, "Repository label");
  } catch {
    failContract(`${path}.label`, "expected a portable repository label");
  }
}

export function parseRenameRepository(value: unknown): RenameRepositoryDto {
  const request = readContractObject(value, "$"),
    label = readPortableRepositoryLabel(request, "$");
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
  const status = readRequiredContractString(issue, "status", path);

  if (!issueCodes.has(code as RepositoryCatalogIssueDto["code"])) {
    failContract(`${path}.code`, `unsupported catalog issue code ${code}`);
  }
  if (!issueStatuses.has(status as RepositoryCatalogIssueDto["status"])) {
    failContract(`${path}.status`, `unsupported catalog issue status ${status}`);
  }

  const adapter = readAdapter(issue, "adapter", path);

  return {
    adapter,
    code: code as RepositoryCatalogIssueDto["code"],
    id: readRepositoryId(issue, path),
    location: readRepositoryLocation(issue, adapter, path, { nullable: true }),
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
      label: readPortableRepositoryLabel(request, "$"),
    };
  }
  if (adapter === "webdav") {
    assertExactContractFields(request, createWebDavRepositoryFields, "$");
    return {
      adapter,
      authentication: parseRepositoryAuthentication(request.authentication),
      initialContent: parseWorkspaceRepositoryContent(request.initialContent),
      label: readPortableRepositoryLabel(request, "$"),
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
