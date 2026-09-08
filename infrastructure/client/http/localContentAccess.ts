// SPDX-License-Identifier: GPL-3.0-or-later

import type { LocalContentAccess } from "../../../application/operations/index.ts";
import { buildApiOperationPath,parseApiOperationResponse } from "../../../contracts/api/index.ts";
import type { ContentOperationResultDto } from "../../../contracts/content/index.ts";
import { requestApiJson,type HttpApiTransportOptions } from "./apiTransport.ts";

export function createHttpLocalContentAccess({ baseUrl, fetch: fetchFn = globalThis.fetch.bind(globalThis) }: HttpApiTransportOptions): LocalContentAccess {
  return {
    serviceOrigin: new URL(baseUrl).origin,
    async getOperation(operationId) {
      return parseApiOperationResponse("getContentOperation", 200, await requestApiJson(fetchFn, baseUrl, buildApiOperationPath("getContentOperation", { operationId }))) as ContentOperationResultDto;
    },
  };
}
