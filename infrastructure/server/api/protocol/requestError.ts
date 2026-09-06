// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApiErrorCodeDto, ApiErrorDto } from '../../../../contracts/api/types.ts';
import { parseApiError } from '../../../../contracts/api/parseError.ts';
import { ApiErrorCatalog } from '../../../../contracts/api/errorPolicy.ts';

export class ApiRequestError extends Error {
  readonly code: ApiErrorCodeDto;
  readonly details: Record<string, unknown>;
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor(
    code: ApiErrorCodeDto,
    message: string,
    {
      details,
      retryable = ApiErrorCatalog[code].retryable,
      statusCode = ApiErrorCatalog[code].statusCode,
    }: {
      details?: Record<string, unknown>;
      retryable?: boolean;
      statusCode?: number;
    } = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.details = details ?? {};
    this.retryable = retryable;
    this.statusCode = statusCode;
  }

  toDto(requestId: string): ApiErrorDto {
    return parseApiError({
      code: this.code,
      details: this.details,
      message: this.message,
      requestId,
      retryable: this.retryable,
    });
  }
}

export function apiNotFound(message = "Resource does not exist"): never {
  throw new ApiRequestError("not_found", message);
}
