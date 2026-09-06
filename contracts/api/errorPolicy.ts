// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApiErrorCodeDto } from './types.ts';

export const ApiErrorCatalog = {
  adapter_unavailable: { retryable: true, statusCode: 503 },
  content_commit_indeterminate: { retryable: false, statusCode: 500 },
  domain_validation_failed: { retryable: false, statusCode: 422 },
  forbidden: { retryable: false, statusCode: 403 },
  idempotency_conflict: { retryable: false, statusCode: 409 },
  insufficient_storage: { retryable: false, statusCode: 507 },
  internal_error: { retryable: false, statusCode: 500 },
  invalid_request: { retryable: false, statusCode: 400 },
  merge_conflict: { retryable: false, statusCode: 409 },
  not_found: { retryable: false, statusCode: 404 },
  occurrence_conflict: { retryable: false, statusCode: 409 },
  operation_audit_finalize_failed: { retryable: false, statusCode: 500 },
  operation_audit_unavailable: { retryable: false, statusCode: 503 },
  profile_unavailable: { retryable: true, statusCode: 503 },
  proposal_stale: { retryable: false, statusCode: 409 },
  repository_busy: { retryable: true, statusCode: 423 },
  repository_corrupt: { retryable: false, statusCode: 500 },
  resource_conflict: { retryable: false, statusCode: 409 },
  session_capacity_reached: { retryable: true, statusCode: 429 },
  session_unavailable: { retryable: false, statusCode: 409 },
  unauthorized: { retryable: false, statusCode: 401 },
} as const satisfies Record<
  ApiErrorCodeDto,
  { retryable: boolean; statusCode: number }
>;
