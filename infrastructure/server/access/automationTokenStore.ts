// SPDX-License-Identifier: GPL-3.0-or-later

import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  ApiCreateTokenRequestDto,
  ApiCreatedTokenDto,
  ApiPrincipalDto,
  ApiTokenDto,
} from "../../../contracts/api/index.ts";
import { parseApiTokenList } from "../../../contracts/api/index.ts";
import {
  assertStateFields,
  requireStateRecord,
  SecureJsonPartition,
  type SecureStateFileReplacer,
  createStateDigest,
  stateDigestsEqual,
} from "../state/index.ts";

import {
  AccessTokenUsageSession,
  type AccessTokenUsageResult,
} from "./accessTokenUsageSession.ts";

const formatVersion = 1;

type StoredToken = ApiTokenDto & { digest: string };
type TokenState = { formatVersion: typeof formatVersion; tokens: StoredToken[] };

function parseStoredToken(value: unknown, index: number): StoredToken {
  const pathLabel = `tokens[${index}]`;
  const record = requireStateRecord(value, pathLabel);

  assertStateFields(record, [
    "createdAt", "digest", "id", "lastUsedAt", "name", "prefix",
    "repositoryIds", "scopes",
  ], pathLabel);
  if (typeof record.digest !== "string" || !/^[0-9a-f]{64}$/.test(record.digest)) {
    throw new Error(`${pathLabel}.digest is invalid.`);
  }
  const { digest, ...wire } = record;
  const token = parseApiTokenList({ tokens: [wire] })[0]!;

  return { ...token, digest };
}

function parseTokenState(value: unknown): TokenState {
  const record = requireStateRecord(value, "automation token state");

  assertStateFields(record, ["formatVersion", "tokens"], "automation token state");
  if (record.formatVersion !== formatVersion || !Array.isArray(record.tokens)) {
    throw new Error("Automation token state has an invalid format.");
  }
  return {
    formatVersion,
    tokens: record.tokens.map(parseStoredToken),
  };
}

function tokenDto({ digest: _digest, ...token }: StoredToken): ApiTokenDto {
  return token;
}

export class AutomationTokenStore {
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
      fileName: "automation-tokens.json",
      name: "automation access",
      parse: parseTokenState,
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
                kind: "automation" as const,
                name: token.name,
                repositoryIds: token.repositoryIds,
                scopes: token.scopes,
              },
            },
          };
        },
      )
    );
  }

  createToken(request: ApiCreateTokenRequestDto): Promise<ApiCreatedTokenDto> {
    return this.#usage.run(() =>
      this.#partition.mutate((state) => {
        const secret = `ctn_${randomBytes(32).toString("base64url")}`;
        const token: StoredToken = {
          createdAt: this.#timestamp(),
          digest: createStateDigest(secret),
          id: `automation-token-${randomUUID()}`,
          lastUsedAt: null,
          name: request.name,
          prefix: secret.slice(0, 12),
          repositoryIds: request.repositoryIds,
          scopes: request.scopes,
        };

        state.tokens.push(token);
        return { changed: true, result: { secret, token: tokenDto(token) } };
      })
    );
  }

  listTokens(): Promise<ApiTokenDto[]> {
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
      throw new Error("Automation access time source returned an invalid date.");
    }
    return date.toISOString();
  }
}
