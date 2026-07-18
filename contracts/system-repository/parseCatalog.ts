// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactSystemFields,
  failSystemContract,
  readRequiredSystemString,
  readSystemArray,
  readSystemObject,
} from "./contractValue.ts";
import { parseSystemRepositoryPurpose } from "./parseRepository.ts";
import type {
  SystemRepositoryCatalogDto,
  SystemRepositoryDescriptorDto,
  SystemRepositoryIssueDto,
  SystemRepositoryLocationDto,
  SystemRepositoryPurposeDto,
  SystemRepositoryRetryResultDto,
} from "./types.ts";

const descriptorFields = ["id", "label", "location", "protected"] as const;
const issueFields = ["code", "id", "location", "message", "status"] as const;
const catalogFields = ["issues", "repositories"] as const;
const retryFields = ["status"] as const;
const serverLocationFields = ["serverPath", "type"] as const;
const browserLocationFields = ["databaseName", "type"] as const;
const issueCodes = new Set<SystemRepositoryIssueDto["code"]>([
  "adapter_unavailable",
  "repository_corrupt",
  "unsupported_repository_version",
]);

export function systemRepositoryLabel(
  purpose: SystemRepositoryPurposeDto,
): SystemRepositoryDescriptorDto["label"] {
  return purpose === "system-journal" ? "日记" : "代办";
}

function parseLocation(value: unknown, path: string): SystemRepositoryLocationDto {
  const location = readSystemObject(value, path);
  const type = readRequiredSystemString(location, "type", path);
  if (type === "server") {
    assertExactSystemFields(location, serverLocationFields, path);
    return {
      serverPath: readRequiredSystemString(location, "serverPath", path),
      type,
    };
  }
  if (type === "browser") {
    assertExactSystemFields(location, browserLocationFields, path);
    return {
      databaseName: readRequiredSystemString(location, "databaseName", path),
      type,
    };
  }
  failSystemContract(`${path}.type`, `unsupported location type ${type}`);
}

export function parseSystemRepositoryDescriptor(
  value: unknown,
  path = "$",
): SystemRepositoryDescriptorDto {
  const descriptor = readSystemObject(value, path);
  assertExactSystemFields(descriptor, descriptorFields, path);
  const id = parseSystemRepositoryPurpose(descriptor.id, `${path}.id`);
  if (descriptor.label !== systemRepositoryLabel(id)) {
    failSystemContract(`${path}.label`, "system repository label does not match purpose");
  }
  if (descriptor.protected !== true) {
    failSystemContract(`${path}.protected`, "system repository must be protected");
  }
  return {
    id,
    label: systemRepositoryLabel(id),
    location: parseLocation(descriptor.location, `${path}.location`),
    protected: true,
  };
}

function parseIssue(value: unknown, path: string): SystemRepositoryIssueDto {
  const issue = readSystemObject(value, path);
  assertExactSystemFields(issue, issueFields, path);
  const code = readRequiredSystemString(issue, "code", path);
  if (!issueCodes.has(code as SystemRepositoryIssueDto["code"])) {
    failSystemContract(`${path}.code`, `unsupported issue code ${code}`);
  }
  if (issue.status !== "fault") failSystemContract(`${path}.status`, "expected fault");
  return {
    code: code as SystemRepositoryIssueDto["code"],
    id: parseSystemRepositoryPurpose(issue.id, `${path}.id`),
    location: issue.location === null
      ? null
      : parseLocation(issue.location, `${path}.location`),
    message: readRequiredSystemString(issue, "message", path),
    status: "fault",
  };
}

export function parseSystemRepositoryCatalog(value: unknown): SystemRepositoryCatalogDto {
  const catalog = readSystemObject(value, "$");
  assertExactSystemFields(catalog, catalogFields, "$");
  const repositories = readSystemArray(catalog, "repositories", "$").map(
    (value, index) => parseSystemRepositoryDescriptor(value, `$.repositories[${index}]`),
  );
  const issues = readSystemArray(catalog, "issues", "$").map(
    (value, index) => parseIssue(value, `$.issues[${index}]`),
  );
  const ids = [...repositories, ...issues].map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    failSystemContract("$", "duplicate system repository purpose");
  }
  const expectedPurposes: SystemRepositoryPurposeDto[] = [
    "system-journal",
    "system-todo",
  ];
  if (
    ids.length !== expectedPurposes.length ||
    expectedPurposes.some((purpose) => !ids.includes(purpose))
  ) {
    failSystemContract("$", "catalog must cover every system repository purpose");
  }
  return { issues, repositories };
}

export function parseSystemRepositoryRetryResult(
  value: unknown,
): SystemRepositoryRetryResultDto {
  const result = readSystemObject(value, "$");
  assertExactSystemFields(result, retryFields, "$");
  if (result.status !== "ready" && result.status !== "fault") {
    failSystemContract("$.status", "unsupported retry status");
  }
  return { status: result.status };
}
