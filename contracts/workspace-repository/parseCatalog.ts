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
  RepositoryCatalogDto,
  RepositoryDescriptorDto,
} from "./types.ts";

const descriptorFields = [
  "adapter",
  "id",
  "label",
  "repositoryPath",
] as const;
const catalogFields = ["repositories"] as const;
const createRepositoryFields = ["content", "id"] as const;
const adapterKinds = new Set<RepositoryAdapterKindDto>([
  "browser",
  "local",
  "webdav",
]);

export function isRepositoryId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

function readRepositoryId(
  value: Record<string, unknown>,
  path: string,
) {
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
    repositoryPath: readRequiredContractString(
      descriptor,
      "repositoryPath",
      path,
    ),
  };
}

export function parseRepositoryCatalog(
  value: unknown,
): RepositoryCatalogDto {
  const catalog = readContractObject(value, "$");

  assertExactContractFields(catalog, catalogFields, "$");
  const repositories = readContractArray(catalog, "repositories", "$")
    .map((descriptor, index) =>
      parseRepositoryDescriptor(descriptor, `$.repositories[${index}]`),
    );
  const ids = new Set<string>();

  repositories.forEach((descriptor, index) => {
    if (ids.has(descriptor.id)) {
      failContract(
        `$.repositories[${index}].id`,
        `duplicate repository id ${descriptor.id}`,
      );
    }
    ids.add(descriptor.id);
  });

  return { repositories };
}

export function parseCreateRepository(
  value: unknown,
): CreateRepositoryDto {
  const request = readContractObject(value, "$");

  assertExactContractFields(request, createRepositoryFields, "$");

  return {
    content: parseWorkspaceRepositoryContent(request.content),
    id: readRepositoryId(request, "$"),
  };
}
