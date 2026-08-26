// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAccessAdministration,
  AutomationApiToken,
  AutomationApiScope,
  CreateAutomationApiTokenRequest,
  TrustedClientToken,
} from "../../../application/apiAccess/apiAccessAdministration";
import { serializeJsonIteratively } from "../../../contracts/common/json";
import {
  parseApiCreatedToken,
  parseApiTokenList,
} from "../../../contracts/api/parse";
import {
  ApiCreatedTrustedClientTokenSchema,
  ApiTrustedClientTokenListSchema,
} from "../../../contracts/api/schemas/admin";
import { parseApiSchema } from "../../../contracts/api/parse";
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
          "/api/v3/admin/automation-tokens",
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
    async createTrustedClientToken(name: string) {
      const created = parseApiSchema(
        ApiCreatedTrustedClientTokenSchema,
        await requestApiJson(
          fetchFn,
          baseUrl,
          "/api/v3/admin/trusted-client-tokens",
          {
            body: serializeJsonIteratively({ name }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
          token,
        ),
      );

      return { secret: created.secret, token: created.token as TrustedClientToken };
    },
    async listTrustedClientTokens() {
      return parseApiSchema(
        ApiTrustedClientTokenListSchema,
        await requestApiJson(
          fetchFn,
          baseUrl,
          "/api/v3/admin/trusted-client-tokens",
          undefined,
          token,
        ),
      ).tokens as TrustedClientToken[];
    },
    async listTokens() {
      return parseApiTokenList(
        await requestApiJson(
          fetchFn,
          baseUrl,
          "/api/v3/admin/automation-tokens",
          undefined,
          token,
        ),
      ).map(projectToken);
    },
    async revokeToken(tokenId) {
      await requestApiJson(
        fetchFn,
        baseUrl,
        `/api/v3/admin/automation-tokens/${encodeURIComponent(tokenId)}`,
        { method: "DELETE" },
        token,
      );
    },
    async revokeTrustedClientToken(tokenId) {
      await requestApiJson(
        fetchFn,
        baseUrl,
        `/api/v3/admin/trusted-client-tokens/${encodeURIComponent(tokenId)}`,
        { method: "DELETE" },
        token,
      );
    },
  };
}
