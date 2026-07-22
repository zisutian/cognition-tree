// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../contracts/workspace-repository/json.ts";
import {
  SystemRepositoryContractError,
  UnsupportedSystemRepositoryVersionError,
} from "../../contracts/system-repository/contractValue.ts";
import {
  parseSystemRepositoryCommit,
  parseSystemRepositoryContent,
} from "../../contracts/system-repository/parseRepository.ts";
import { serializeSystemRepositoryRevisionContent } from "../../contracts/system-repository/revision.ts";
import type {
  SystemRepositoryContentDto,
  SystemRepositoryPurposeDto,
  SystemRepositoryRevisionDto,
} from "../../contracts/system-repository/types.ts";
import {
  JournalContentValidationError,
  validateJournalContent,
  validateJournalContentTransition,
} from "../../core/journal/model/journalContent.ts";
import {
  TodoContentValidationError,
  validateTodoContent,
  validateTodoContentTransition,
} from "../../core/todo/model/todoContent.ts";
import { RepositoryCorruptError } from "./repositoryStore.ts";
import {
  FileSystemVersionedContentStore,
  type VersionedContentStore,
  VersionedContentRevisionConflictError,
} from "./versionedContentStore.ts";

export type SystemRepositoryStore =
  VersionedContentStore<SystemRepositoryContentDto>;

export type SystemRepositoryContentValidator = (
  content: SystemRepositoryContentDto,
) => void;

export type SystemRepositoryTransitionValidator = (
  previous: SystemRepositoryContentDto,
  next: SystemRepositoryContentDto,
) => void;

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
  content: SystemRepositoryContentDto,
) {
  if (content.purpose === "system-journal") {
    try {
      validateJournalContent(content);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new SystemRepositoryContentValidationError(error.message, error);
      }
      throw error;
    }
    return;
  }
  try {
    validateTodoContent(content);
  } catch (error) {
    if (error instanceof TodoContentValidationError) {
      throw new SystemRepositoryContentValidationError(error.message, error);
    }
    throw error;
  }
}

export function validateSystemRepositoryTransition(
  previous: SystemRepositoryContentDto,
  next: SystemRepositoryContentDto,
) {
  validateSystemRepositoryContent(previous);
  validateSystemRepositoryContent(next);
  if (previous.purpose !== next.purpose) {
    throw new SystemRepositoryTransitionValidationError(
      "System repository purpose is immutable.",
    );
  }
  if (
    previous.purpose === "system-journal" &&
    next.purpose === "system-journal"
  ) {
    try {
      validateJournalContentTransition(previous, next);
    } catch (error) {
      if (error instanceof JournalContentValidationError) {
        throw new SystemRepositoryTransitionValidationError(
          error.message,
          error,
        );
      }
      throw error;
    }
    return;
  }
  if (previous.purpose === "system-todo" && next.purpose === "system-todo") {
    try {
      validateTodoContentTransition(previous, next);
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
}

function validateCommitBoundary(operation: () => void) {
  try {
    operation();
  } catch (error) {
    if (error instanceof SystemRepositoryValidationError) {
      throw new SystemRepositoryContractError("$.content", error.message);
    }
    throw error;
  }
}

export {
  VersionedContentRevisionConflictError as SystemRepositoryRevisionConflictError,
};

export function createSystemRepositoryRevision(
  content: SystemRepositoryContentDto,
): SystemRepositoryRevisionDto {
  return `sha256:${createHash("sha256")
    .update(serializeSystemRepositoryRevisionContent(content))
    .digest("hex")}`;
}

export class FileSystemSystemRepositoryStore
  extends FileSystemVersionedContentStore<SystemRepositoryContentDto> {
  constructor(
    filePath: string,
    purpose: SystemRepositoryPurposeDto,
    validateContent: SystemRepositoryContentValidator,
    validateTransition: SystemRepositoryTransitionValidator,
  ) {
    super(filePath, {
      createRevision: createSystemRepositoryRevision,
      normalizeReadError(error) {
        if (error instanceof UnsupportedSystemRepositoryVersionError) {
          return error;
        }
        if (
          error instanceof SystemRepositoryContractError ||
          error instanceof SystemRepositoryValidationError
        ) {
          return new RepositoryCorruptError(
            "System repository content is invalid",
          );
        }
        return error;
      },
      parseCommit(value) {
        return parseSystemRepositoryCommit(value, purpose);
      },
      parseContent(value) {
        return parseSystemRepositoryContent(value, purpose);
      },
      serializeContent(content) {
        return `${serializeJsonIteratively(content, { indent: 2 })}\n`;
      },
      validateContent,
      validateTransition,
      validateWriteBoundary: validateCommitBoundary,
    });
  }
}
