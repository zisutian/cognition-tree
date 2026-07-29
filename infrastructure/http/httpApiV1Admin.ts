// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAccessAdministration,
  AutomationApiToken,
  AutomationApiScope,
  CreateAutomationApiTokenRequest,
} from "../../application/apiAccess/apiAccessAdministration";
import { serializeJsonIteratively } from "../../contracts/common/json";
import {
  parseApiV1AuditPage,
  parseApiV1CreatedToken,
  parseApiV1TokenList,
} from "../../contracts/api/parse";
import {
  requestRepositoryJson,
  type HttpRepositoryTransportOptions,
} from "./httpRepositoryTransport";

function projectToken(
  token: ReturnType<typeof parseApiV1TokenList>[number],
): AutomationApiToken {
  return {
    ...token,
    scopes: token.scopes as AutomationApiScope[],
  };
}

export function createHttpApiV1Administration({
  baseUrl = "http://127.0.0.1:3001",
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpRepositoryTransportOptions): ApiAccessAdministration {
  return {
    async createToken(request: CreateAutomationApiTokenRequest) {
      const created = parseApiV1CreatedToken(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          "/api/v1/admin/tokens",
          {
            body: serializeJsonIteratively(request),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
          token,
        ),
      );

      return { secret: created.secret, token: projectToken(created.token) };
    },
    async listAudit(cursor = null) {
      const query = new URLSearchParams({ limit: "50" });

      if (cursor) query.set("cursor", cursor);
      return parseApiV1AuditPage(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          `/api/v1/admin/audit?${query}`,
          undefined,
          token,
        ),
      );
    },
    async listTokens() {
      return parseApiV1TokenList(
        await requestRepositoryJson(
          fetchFn,
          baseUrl,
          "/api/v1/admin/tokens",
          undefined,
          token,
        ),
      ).map(projectToken);
    },
    async revokeToken(tokenId) {
      await requestRepositoryJson(
        fetchFn,
        baseUrl,
        `/api/v1/admin/tokens/${encodeURIComponent(tokenId)}`,
        { method: "DELETE" },
        token,
      );
    },
  };
}
