// SPDX-License-Identifier: GPL-3.0-or-later

import {
  cognitionMobileContractVersion,
  type MobileApiErrorCodeDto,
  type MobileApiErrorDto,
} from "../../../contracts/mobile/types.ts";
import type {
  TodoLocalDate,
} from "../../../core/todo/recurrence/todoRecurrence.ts";
import type { BuiltInApiCatalog } from "./builtInApiHandlers.ts";
import { WorkspaceApiRequestError } from "./workspaceApiErrors.ts";
import type { WorkspaceApiRoute } from "./workspaceApiRoutes.ts";

export type MobileApiRoute = Extract<
  WorkspaceApiRoute,
  {
    kind:
      | "mobile-status"
      | "mobile-journal-entries"
      | "mobile-journal-entry"
      | "mobile-todo-collections"
      | "mobile-todo-collection"
      | "mobile-todo-completion";
  }
>;

export type MobileJournalApiRoute = Extract<
  MobileApiRoute,
  {
    kind:
      | "mobile-journal-entries"
      | "mobile-journal-entry";
  }
>;

export type MobileTodoApiRoute = Extract<
  MobileApiRoute,
  {
    kind:
      | "mobile-todo-collections"
      | "mobile-todo-collection"
      | "mobile-todo-completion";
  }
>;

export type MobileApiRuntime = {
  now(): Date;
  today(): TodoLocalDate;
};

export class MobileApiRequestError extends Error {
  readonly code: MobileApiErrorCodeDto;
  readonly currentOccurrenceDate?: TodoLocalDate | null;
  readonly currentRevision?: `sha256:${string}`;
  readonly statusCode: number;

  constructor(
    code: MobileApiErrorCodeDto,
    message: string,
    {
      currentOccurrenceDate,
      currentRevision,
      statusCode,
    }: {
      currentOccurrenceDate?: TodoLocalDate | null;
      currentRevision?: `sha256:${string}`;
      statusCode: number;
    },
  ) {
    super(message);
    this.name = "MobileApiRequestError";
    this.code = code;
    this.currentOccurrenceDate = currentOccurrenceDate;
    this.currentRevision = currentRevision;
    this.statusCode = statusCode;
  }

  toDto(requestId: string): MobileApiErrorDto {
    return {
      code: this.code,
      contractVersion: cognitionMobileContractVersion,
      ...(this.currentOccurrenceDate !== undefined
        ? { currentOccurrenceDate: this.currentOccurrenceDate }
        : {}),
      ...(this.currentRevision
        ? { currentRevision: this.currentRevision }
        : {}),
      message: this.message,
      requestId,
    };
  }
}

export function isMobileApiRoute(
  route: WorkspaceApiRoute,
): route is MobileApiRoute {
  return route.kind.startsWith("mobile-");
}

function serverLocalDate(date = new Date()): TodoLocalDate {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as TodoLocalDate;
}

export const serverMobileApiRuntime: MobileApiRuntime = {
  now: () => new Date(),
  today: () => serverLocalDate(),
};

export function requireBuiltInCatalog(
  catalog: BuiltInApiCatalog | undefined,
): BuiltInApiCatalog {
  if (!catalog) {
    throw new WorkspaceApiRequestError(
      "adapter_unavailable",
      "Built-in data catalog is unavailable",
    );
  }
  return catalog;
}
