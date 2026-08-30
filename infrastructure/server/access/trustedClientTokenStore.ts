// SPDX-License-Identifier: GPL-3.0-or-later

import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  ApiCreatedTrustedClientTokenDto,
  ApiCreateTrustedClientTokenRequestDto,
  ApiPrincipalDto,
  ApiTrustedClientTokenDto,
} from "../../../contracts/api/types.ts";
import { ApiTrustedClientTokenListSchema } from "../../../contracts/api/schemas/admin.ts";
import { parseApiSchema } from "../../../contracts/api/parse.ts";
import {
  assertStateFields,
  requireStateRecord,
  SecureJsonPartition,
  type SecureStateFileReplacer,
} from "../state/secureJsonPartition.ts";
import { createStateDigest, stateDigestsEqual } from "../state/stateDigest.ts";
import {
  AccessTokenUsageSession,
  type AccessTokenUsageResult,
} from "./accessTokenUsageSession.ts";

const formatVersion = 1;
type StoredToken = ApiTrustedClientTokenDto & { digest: string };
type TokenState = { formatVersion: typeof formatVersion; tokens: StoredToken[] };

function parseStoredToken(value: unknown, index: number): StoredToken {
  const label = `trustedClientTokens[${index}]`;
  const record = requireStateRecord(value, label);

  assertStateFields(record, [
    "createdAt", "digest", "id", "lastUsedAt", "name", "prefix",
  ], label);
  if (typeof record.digest !== "string" || !/^[0-9a-f]{64}$/.test(record.digest)) {
    throw new Error(`${label}.digest is invalid.`);
  }
  const { digest, ...wire } = record;
  const token = parseApiSchema(ApiTrustedClientTokenListSchema, {
    tokens: [wire],
  }).tokens[0]!;

  return { ...token, digest };
}

function parseState(value: unknown): TokenState {
  const record = requireStateRecord(value, "trusted client token state");

  assertStateFields(record, ["formatVersion", "tokens"], "trusted client token state");
  if (record.formatVersion !== formatVersion || !Array.isArray(record.tokens)) {
    throw new Error("Trusted client token state has an invalid format.");
  }
  return { formatVersion, tokens: record.tokens.map(parseStoredToken) };
}

function tokenDto({ digest: _digest, ...token }: StoredToken) {
  return token;
}

export class TrustedClientTokenStore {
  readonly #now: () => Date;
  readonly #partition: SecureJsonPartition<TokenState>;
  readonly #usage = new AccessTokenUsageSession();

  constructor(
    stateDirectory: string,
    {
      now = () => new Date(),
      replaceTokenFile,
    }: {
      now?: () => Date;
      replaceTokenFile?: SecureStateFileReplacer;
    } = {},
  ) {
    this.#now = now;
    this.#partition = new SecureJsonPartition({
      createInitial: () => ({ formatVersion, tokens: [] }),
      directory: path.join(path.resolve(stateDirectory), "access-v1"),
      fileName: "trusted-client-tokens.json",
      name: "trusted client access",
      parse: parseState,
      ...(replaceTokenFile ? { replaceFile: replaceTokenFile } : {}),
    });
  }

  authenticate(secret: string): Promise<ApiPrincipalDto | null> {
    return this.#usage.runObservedAccess(() =>
      this.#partition.mutate<AccessTokenUsageResult<ApiPrincipalDto | null>>(
        (state) => {
          const digest = createStateDigest(secret);
          const token = state.tokens.find((candidate) =>
            stateDigestsEqual(candidate.digest, digest)
          );

          if (!token) {
            return {
              changed: false,
              result: {
                observation: null,
                result: null,
              },
            };
          }
          const observation = this.#usage.prepareObservation({
            observedAt: this.#timestamp(),
            persistedAt: token.lastUsedAt,
            tokenId: token.id,
          });

          if (observation.requiresPersistence) {
            token.lastUsedAt = observation.observedAt;
          }
          return {
            changed: observation.requiresPersistence,
            result: {
              observation,
              result: {
                id: token.id,
                kind: "trusted-client" as const,
                name: token.name,
              },
            },
          };
        },
      )
    );
  }

  createToken(
    request: ApiCreateTrustedClientTokenRequestDto,
  ): Promise<ApiCreatedTrustedClientTokenDto> {
    return this.#usage.run(() =>
      this.#partition.mutate((state) => {
        const secret = `ctt_${randomBytes(32).toString("base64url")}`;
        const token: StoredToken = {
          createdAt: this.#timestamp(),
          digest: createStateDigest(secret),
          id: `trusted-client-token-${randomUUID()}`,
          lastUsedAt: null,
          name: request.name,
          prefix: secret.slice(0, 12),
        };

        state.tokens.push(token);
        return { changed: true, result: { secret, token: tokenDto(token) } };
      })
    );
  }

  listTokens(): Promise<ApiTrustedClientTokenDto[]> {
    return this.#usage.run(() =>
      this.#partition.read((state) =>
        state.tokens.map((token) => ({
          ...tokenDto(token),
          lastUsedAt: this.#usage.resolveLastUsedAt(
            token.id,
            token.lastUsedAt,
          ),
        })).sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt)
        )
      )
    );
  }

  revokeToken(tokenId: string): Promise<boolean> {
    return this.#usage.runRevocation(
      tokenId,
      () => this.#partition.mutate((state) => {
        const index = state.tokens.findIndex(({ id }) => id === tokenId);

        if (index < 0) return { changed: false, result: false };
        state.tokens.splice(index, 1);
        return { changed: true, result: true };
      }),
    );
  }

  #timestamp() {
    const date = this.#now();

    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new Error("Trusted client access time source returned an invalid date.");
    }
    return date.toISOString();
  }
}
