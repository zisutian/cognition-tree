import {
  buildApiOperationPath,
  parseApiCreatedToken,
  parseApiTokenList,
  ApiCreatedTrustedClientTokenSchema,
  ApiTrustedClientTokenListSchema,
  parseApiSchema,
} from "../../../contracts/api/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  ApiAccessAdministration,
  AutomationApiToken,
  AutomationApiScope,
  CreateAutomationApiTokenRequest,
  TrustedClientToken,
} from "../../../application/apiAccess/index.ts";
import { serializeJsonIteratively } from "../../../contracts/common/index.ts";



import {
  requestApiJson,
  type HttpApiTransportOptions,
} from "./apiTransport.ts";

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
          buildApiOperationPath("listApiTokens"),
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
          buildApiOperationPath("listTrustedClientTokens"),
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
          buildApiOperationPath("listTrustedClientTokens"),
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
          buildApiOperationPath("listApiTokens"),
          undefined,
          token,
        ),
      ).map(projectToken);
    },
    async revokeToken(tokenId) {
      await requestApiJson(
        fetchFn,
        baseUrl,
        buildApiOperationPath("revokeToken", { tokenId: tokenId }),
        { method: "DELETE" },
        token,
      );
    },
    async revokeTrustedClientToken(tokenId) {
      await requestApiJson(
        fetchFn,
        baseUrl,
        buildApiOperationPath("revokeTrustedClientToken", { trustedClientTokenId: tokenId }),
        { method: "DELETE" },
        token,
      );
    },
  };
}
