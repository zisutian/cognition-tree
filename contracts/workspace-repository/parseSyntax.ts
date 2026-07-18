// SPDX-License-Identifier: GPL-3.0-or-later

import {
  assertExactContractFields,
  failContract,
  readContractArray,
  readContractObject,
  readContractString,
  readRequiredContractString,
} from "./contractValue.ts";
import type {
  RepositorySyntaxCatalogDto,
  RepositorySyntaxFileDto,
} from "./types.ts";

const syntaxCatalogFields = ["activeFileId", "files"] as const;
const syntaxFileFields = ["id", "source"] as const;
const repositorySyntaxFileIdPattern =
  /^syntax-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isRepositorySyntaxFileId(value: string) {
  return repositorySyntaxFileIdPattern.test(value);
}

export function normalizeRepositorySyntaxProfileName(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function parseRepositorySyntaxFile(
  value: unknown,
  path: string,
): RepositorySyntaxFileDto {
  const file = readContractObject(value, path);

  assertExactContractFields(file, syntaxFileFields, path);
  const id = readRequiredContractString(file, "id", path);
  if (!isRepositorySyntaxFileId(id)) {
    failContract(`${path}.id`, "invalid repository syntax file id");
  }

  return {
    id,
    source: readContractString(file, "source", path),
  };
}

export function parseRepositorySyntaxCatalog(
  value: unknown,
  path = "$.syntax",
): RepositorySyntaxCatalogDto {
  const syntax = readContractObject(value, path);

  assertExactContractFields(syntax, syntaxCatalogFields, path);
  const fileValues = readContractArray(syntax, "files", path);
  const fileIds = new Set<string>();
  const files = fileValues.map((file, index) => {
    const parsed = parseRepositorySyntaxFile(file, `${path}.files[${index}]`);
    if (fileIds.has(parsed.id)) {
      failContract(`${path}.files[${index}].id`, `duplicate syntax file id ${parsed.id}`);
    }
    fileIds.add(parsed.id);
    return parsed;
  });
  const activeFileId = syntax.activeFileId === null
    ? null
    : readRequiredContractString(syntax, "activeFileId", path);

  if (activeFileId !== null && !isRepositorySyntaxFileId(activeFileId)) {
    failContract(`${path}.activeFileId`, "invalid repository syntax file id");
  }
  if (files.length === 0 && activeFileId !== null) {
    failContract(`${path}.activeFileId`, "must be null when syntax files are empty");
  }
  if (files.length > 0 && activeFileId === null) {
    failContract(`${path}.activeFileId`, "must identify an active syntax file");
  }
  if (activeFileId !== null && !fileIds.has(activeFileId)) {
    failContract(`${path}.activeFileId`, `unknown syntax file ${activeFileId}`);
  }

  return { activeFileId, files };
}
