// SPDX-License-Identifier: GPL-3.0-or-later

import type { ContentRevisionDto } from "../../../contracts/common/versionedContent.ts";
import {
  cognitionMobileV2ContractVersion,
  type MobileV2ApiErrorCodeDto,
  type MobileV2ApiErrorDto,
} from "../../../contracts/mobile/types.ts";
import type { TodoLocalDateDto } from "../../../contracts/todo/types.ts";
import type { BuiltInApiCatalog } from "./builtInApiHandlers.ts";
import type { MobileApiRoute } from "./mobileApiCommon.ts";
import {
  mapWorkspaceApiError,
  WorkspaceApiRequestError,
} from "./workspaceApiErrors.ts";

export const maximumMobileV2TreeDepth = 128;

export type MobileV2ApiRoute = Extract<
  MobileApiRoute,
  {
    kind:
      | "mobile-v2-status"
      | "mobile-v2-journal-entries"
      | "mobile-v2-journal-entry"
      | "mobile-v2-todo-collections"
      | "mobile-v2-todo-collection"
      | "mobile-v2-todo-completion";
  }
>;

export type MobileV2JournalApiRoute = Extract<
  MobileV2ApiRoute,
  {
    kind:
      | "mobile-v2-journal-entries"
      | "mobile-v2-journal-entry";
  }
>;

export type MobileV2TodoApiRoute = Extract<
  MobileV2ApiRoute,
  {
    kind:
      | "mobile-v2-todo-collections"
      | "mobile-v2-todo-collection"
      | "mobile-v2-todo-completion";
  }
>;

export class MobileV2ApiRequestError extends Error {
  readonly code: MobileV2ApiErrorCodeDto;
  readonly currentOccurrenceDate?: TodoLocalDateDto | null;
  readonly currentRevision?: ContentRevisionDto;
  readonly statusCode: number;

  constructor(
    code: MobileV2ApiErrorCodeDto,
    message: string,
    {
      currentOccurrenceDate,
      currentRevision,
      statusCode,
    }: {
      currentOccurrenceDate?: TodoLocalDateDto | null;
      currentRevision?: ContentRevisionDto;
      statusCode: number;
    },
  ) {
    super(message);
    this.name = "MobileV2ApiRequestError";
    this.code = code;
    this.currentOccurrenceDate = currentOccurrenceDate;
    this.currentRevision = currentRevision;
    this.statusCode = statusCode;
  }

  toDto(requestId: string): MobileV2ApiErrorDto {
    return {
      code: this.code,
      contractVersion: cognitionMobileV2ContractVersion,
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

export function isMobileV2ApiRoute(
  route: MobileApiRoute,
): route is MobileV2ApiRoute {
  return route.kind.startsWith("mobile-v2-");
}

export function requireBuiltInCatalogV2(
  catalog: BuiltInApiCatalog | undefined,
): BuiltInApiCatalog {
  if (!catalog) {
    throw new MobileV2ApiRequestError(
      "domain_unavailable",
      "Built-in data catalog is unavailable",
      { statusCode: 503 },
    );
  }
  return catalog;
}

export function mapMobileV2ApiError(error: unknown): MobileV2ApiRequestError {
  if (error instanceof MobileV2ApiRequestError) return error;
  const mapped = mapWorkspaceApiError(error);

  if (mapped.code === "invalid_request") {
    return new MobileV2ApiRequestError(
      "invalid_request",
      mapped.message,
      { statusCode: mapped.statusCode },
    );
  }
  if (mapped.code === "repository_not_found") {
    return new MobileV2ApiRequestError(
      "not_found",
      mapped.message,
      { statusCode: 404 },
    );
  }
  if (mapped.code === "revision_conflict") {
    return new MobileV2ApiRequestError(
      "revision_conflict",
      mapped.message,
      {
        ...(mapped.currentRevision
          ? { currentRevision: mapped.currentRevision }
          : {}),
        statusCode: 409,
      },
    );
  }
  return new MobileV2ApiRequestError(
    "domain_unavailable",
    mapped instanceof WorkspaceApiRequestError
      ? mapped.message
      : "Built-in data is unavailable",
    { statusCode: 503 },
  );
}
