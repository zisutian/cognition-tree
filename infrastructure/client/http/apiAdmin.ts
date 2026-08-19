// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAccessAdministration,
  AutomationApiToken,
  AutomationApiScope,
  CreateAutomationApiTokenRequest,
} from "../../../application/apiAccess/apiAccessAdministration";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import {
  parseApiAuditPage,
  parseApiCreatedToken,
  parseApiTokenList,
} from "../../../contracts/api/parse";
import {
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport";

function projectToken(
  token: ReturnType<typeof parseApiTokenList>[number],
): AutomationApiToken {
  return {
    ...token,
    scopes: token.scopes as AutomationApiScope[],
  };
}

export function createHttpApiAdministration({
  baseUrl,
  fetch: fetchFn = globalThis.fetch.bind(globalThis),
  token,
}: HttpApiTransportOptions): ApiAccessAdministration {
  return {
    async createToken(request: CreateAutomationApiTokenRequest) {
      const created = parseApiCreatedToken(
        await requestApiJson(
          fetchFn,
          baseUrl,
          "/api/v2/admin/tokens",
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
      return parseApiAuditPage(
        await requestApiJson(
          fetchFn,
          baseUrl,
          `/api/v2/admin/audit?${query}`,
          undefined,
          token,
        ),
      );
    },
    async listTokens() {
      return parseApiTokenList(
        await requestApiJson(
          fetchFn,
          baseUrl,
          "/api/v2/admin/tokens",
          undefined,
          token,
        ),
      ).map(projectToken);
    },
    async revokeToken(tokenId) {
      await requestApiJson(
        fetchFn,
        baseUrl,
        `/api/v2/admin/tokens/${encodeURIComponent(tokenId)}`,
        { method: "DELETE" },
        token,
      );
    },
  };
}
