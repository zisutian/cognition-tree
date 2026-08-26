// SPDX-License-Identifier: GPL-3.0-or-later

import { ApiErrorSchema, type ApiErrorDto } from "./schemas/foundation.ts";
import { parseApiSchema } from "./parse.ts";

export function parseApiError(value: unknown): ApiErrorDto {
  return parseApiSchema(ApiErrorSchema, value);
}
