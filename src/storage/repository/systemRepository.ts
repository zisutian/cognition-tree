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
import {
  JournalContentValidationError,
  validateJournalContent,
  validateJournalContentTransition,
} from "../../../journal/model/journalContent";
import {
  TodoContentValidationError,
  validateTodoContent,
  validateTodoContentTransition,
} from "../../../todo/model/todoContent";
import type {
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositoryContentValidator,
  VersionedRepositorySnapshot,
  VersionedRepositoryTransitionValidator,
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
export type SystemRepositoryTransitionValidator =
  VersionedRepositoryTransitionValidator<SystemRepositoryContent>;
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

export class SystemRepositoryValidationError extends Error {
  cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SystemRepositoryValidationError";
    this.cause = cause;
  }
}

export class SystemRepositoryContentValidationError
  extends SystemRepositoryValidationError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SystemRepositoryContentValidationError";
  }
}

export class SystemRepositoryTransitionValidationError
  extends SystemRepositoryValidationError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SystemRepositoryTransitionValidationError";
  }
}

export function validateSystemRepositoryContent(
  value: unknown,
  expectedPurpose?: SystemRepositoryPurpose,
): SystemRepositoryContent {
  const content = parseSystemRepositoryContentContract(value, expectedPurpose);

  if (content.purpose === "system-journal") {
    try {
      return validateJournalContent(content);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new SystemRepositoryContentValidationError(error.message, error);
      }
      throw error;
    }
  }
  try {
    return validateTodoContent(content);
  } catch (error) {
    if (error instanceof TodoContentValidationError) {
      throw new SystemRepositoryContentValidationError(error.message, error);
    }
    throw error;
  }
}

export function validateSystemRepositoryTransition(
  previousValue: unknown,
  nextValue: unknown,
  expectedPurpose?: SystemRepositoryPurpose,
): SystemRepositoryContent {
  const previous = validateSystemRepositoryContent(
    previousValue,
    expectedPurpose,
  );
  const next = validateSystemRepositoryContent(nextValue, previous.purpose);

  if (
    previous.purpose === "system-journal" &&
    next.purpose === "system-journal"
  ) {
    try {
      return validateJournalContentTransition(previous, next);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new SystemRepositoryTransitionValidationError(
          error.message,
          error,
        );
      }
      throw error;
    }
  }
  if (previous.purpose === "system-todo" && next.purpose === "system-todo") {
    try {
      return validateTodoContentTransition(previous, next);
    } catch (error) {
      if (error instanceof TodoContentValidationError) {
        throw new SystemRepositoryTransitionValidationError(
          error.message,
          error,
        );
      }
      throw error;
    }
  }
  return next;
}

export type SystemRepositoryRuntime = {
  catalog: SystemRepositoryCatalog;
};
