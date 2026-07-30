// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactWireFields,
  failWireContract,
  readRequiredWireString,
  readWireArray,
  readWireObject,
} from "../common/contractValue.ts";
import type {
  BuiltInCatalogDto,
  BuiltInDescriptorDto,
  BuiltInIdDto,
  BuiltInIssueDto,
  BuiltInLocationDto,
  BuiltInRetryResultDto,
} from "./types.ts";

const contract = "built-ins";
const descriptorFields = ["id", "label", "location", "protected"] as const;
const issueFields = ["code", "id", "location", "message", "status"] as const;
const catalogFields = ["issues", "repositories"] as const;
const retryFields = ["status"] as const;
const serverLocationFields = ["serverPath", "type"] as const;
const ids = ["journal", "todo"] as const satisfies readonly BuiltInIdDto[];
const issueCodes = new Set<BuiltInIssueDto["code"]>([
  "adapter_unavailable",
  "repository_corrupt",
  "unsupported_repository_version",
]);

export function isBuiltInId(value: string): value is BuiltInIdDto {
  return value === "journal" || value === "todo";
}

export function parseBuiltInId(value: unknown, path = "$"): BuiltInIdDto {
  if (typeof value !== "string" || !isBuiltInId(value)) {
    failWireContract(contract, path, "unsupported built-in id");
  }
  return value;
}

export function builtInLabel(id: BuiltInIdDto): BuiltInDescriptorDto["label"] {
  return id === "journal" ? "日记" : "代办";
}

function parseLocation(value: unknown, path: string): BuiltInLocationDto {
  const location = readWireObject(contract, value, path);
  const type = readRequiredWireString(contract, location, "type", path);

  if (type === "server") {
    assertExactWireFields(contract, location, serverLocationFields, path);
    return {
      type,
      serverPath: readRequiredWireString(contract, location, "serverPath", path),
    };
  }
  failWireContract(contract, `${path}.type`, `unsupported location type ${type}`);
}

export function parseBuiltInDescriptor(
  value: unknown,
  path = "$",
): BuiltInDescriptorDto {
  const descriptor = readWireObject(contract, value, path);

  assertExactWireFields(contract, descriptor, descriptorFields, path);
  const id = parseBuiltInId(descriptor.id, `${path}.id`);
  if (descriptor.label !== builtInLabel(id)) {
    failWireContract(contract, `${path}.label`, "label does not match id");
  }
  if (descriptor.protected !== true) {
    failWireContract(contract, `${path}.protected`, "built-in data must be protected");
  }
  return {
    id,
    label: builtInLabel(id),
    location: parseLocation(descriptor.location, `${path}.location`),
    protected: true,
  };
}

function parseIssue(value: unknown, path: string): BuiltInIssueDto {
  const issue = readWireObject(contract, value, path);

  assertExactWireFields(contract, issue, issueFields, path);
  const code = readRequiredWireString(contract, issue, "code", path);
  if (!issueCodes.has(code as BuiltInIssueDto["code"])) {
    failWireContract(contract, `${path}.code`, `unsupported issue code ${code}`);
  }
  if (issue.status !== "fault") {
    failWireContract(contract, `${path}.status`, "expected fault");
  }
  return {
    code: code as BuiltInIssueDto["code"],
    id: parseBuiltInId(issue.id, `${path}.id`),
    location: issue.location === null
      ? null
      : parseLocation(issue.location, `${path}.location`),
    message: readRequiredWireString(contract, issue, "message", path),
    status: "fault",
  };
}

export function parseBuiltInCatalog(value: unknown): BuiltInCatalogDto {
  const catalog = readWireObject(contract, value, "$");

  assertExactWireFields(contract, catalog, catalogFields, "$");
  const repositories = readWireArray(contract, catalog, "repositories", "$" )
    .map((entry, index) => parseBuiltInDescriptor(entry, `$.repositories[${index}]`));
  const issues = readWireArray(contract, catalog, "issues", "$" )
    .map((entry, index) => parseIssue(entry, `$.issues[${index}]`));
  const projectedIds = [...repositories, ...issues].map(({ id }) => id);
  if (
    projectedIds.length !== ids.length ||
    new Set(projectedIds).size !== projectedIds.length ||
    ids.some((id) => !projectedIds.includes(id))
  ) {
    failWireContract(contract, "$", "catalog must cover journal and todo exactly once");
  }
  return { issues, repositories };
}

export function parseBuiltInRetryResult(value: unknown): BuiltInRetryResultDto {
  const result = readWireObject(contract, value, "$");

  assertExactWireFields(contract, result, retryFields, "$");
  if (result.status !== "ready" && result.status !== "fault") {
    failWireContract(contract, "$.status", "unsupported retry status");
  }
  return { status: result.status };
}
