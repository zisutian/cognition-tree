// SPDX-License-Identifier: GPL-3.0-or-later

import { buildApiOperationPath } from "../../../contracts/api/index.ts";
import { parseBuiltInCatalog, parseBuiltInId, parseBuiltInRetryResult } from "../../../contracts/built-ins/index.ts";
import type { BuiltInCatalog } from "../../../application/repository/index.ts";
import { requestApiJson, type HttpApiTransportOptions } from "./apiTransport.ts";

export function createHttpBuiltInCatalogBackend({ baseUrl, fetch: fetchFn = globalThis.fetch.bind(globalThis), token }: HttpApiTransportOptions): BuiltInCatalog {
  return {
    label: "HTTP 内置数据",
    async listBuiltIns() {
      return parseBuiltInCatalog(await requestApiJson(fetchFn, baseUrl, buildApiOperationPath("listBuiltIns"), undefined, token));
    },
    async retry(value) {
      const id = parseBuiltInId(value);
      return parseBuiltInRetryResult(await requestApiJson(fetchFn, baseUrl, buildApiOperationPath("retryBuiltIn", { builtInId: id }), { method: "POST" }, token));
    },
  };
}
