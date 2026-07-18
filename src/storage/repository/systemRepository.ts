// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  SystemRepositoryCatalogDto,
  SystemRepositoryContentDto,
  SystemRepositoryDescriptorDto,
  SystemRepositoryIssueDto,
  SystemRepositoryLocationDto,
  SystemRepositoryPurposeDto,
  SystemRepositoryRetryResultDto,
  SystemRepositoryRevisionDto,
} from "../../../contracts/system-repository/types";
import { parseSystemRepositoryContent as parseSystemRepositoryContentContract } from "../../../contracts/system-repository/parseRepository";
import type {
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositoryContentValidator,
  VersionedRepositorySnapshot,
} from "./versionedRepository";

export type SystemRepositoryPurpose = SystemRepositoryPurposeDto;
export type SystemRepositoryContent = SystemRepositoryContentDto;
export type SystemRepositoryRevision = SystemRepositoryRevisionDto;
export type SystemRepositoryLocation = SystemRepositoryLocationDto;
export type SystemRepositoryDescriptor = SystemRepositoryDescriptorDto;
export type SystemRepositoryIssue = SystemRepositoryIssueDto;
export type SystemRepositoryCatalogData = SystemRepositoryCatalogDto;
export type SystemRepositoryRetryResult = SystemRepositoryRetryResultDto;
export type SystemLocalDraftRevision = `draft:${string}`;
export type SystemRepositoryContentValidator =
  VersionedRepositoryContentValidator<SystemRepositoryContent>;
export type SystemRepositoryBackend = VersionedRepositoryBackend<
  SystemRepositoryContent,
  SystemRepositoryRevision
>;
export type SystemRepositorySnapshot = VersionedRepositorySnapshot<
  SystemRepositoryContent,
  SystemRepositoryRevision,
  SystemLocalDraftRevision
>;
export type SystemRepository = VersionedRepository<
  SystemRepositoryContent,
  SystemRepositoryRevision,
  SystemLocalDraftRevision,
  SystemRepositoryLocation
>;

export type SystemRepositoryCatalog = {
  label: string;
  listRepositories(): Promise<SystemRepositoryCatalogData>;
  openRepository(descriptor: SystemRepositoryDescriptor): SystemRepository;
  retryRepository(
    purpose: SystemRepositoryPurpose,
  ): Promise<SystemRepositoryRetryResult>;
};

export const systemRepositoryPurposes = [
  "system-journal",
  "system-todo",
] as const satisfies readonly SystemRepositoryPurpose[];

export function parseSystemRepositoryContent(
  value: unknown,
  expectedPurpose?: SystemRepositoryPurpose,
) {
  return parseSystemRepositoryContentContract(value, expectedPurpose);
}

export type SystemRepositoryRuntime = {
  catalog: SystemRepositoryCatalog;
};
