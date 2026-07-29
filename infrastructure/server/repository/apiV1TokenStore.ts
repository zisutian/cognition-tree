// SPDX-License-Identifier: GPL-3.0-or-later

import { randomBytes, randomUUID } from "node:crypto";
import type {
  ApiV1CreateTokenRequestDto,
  ApiV1CreatedTokenDto,
  ApiV1PrincipalDto,
  ApiV1TokenDto,
} from "../../../contracts/api/types.ts";
import {
  parseApiV1TokenList,
} from "../../../contracts/api/parse.ts";
import {
  apiV1StateDigestsEqual,
  createApiV1StateDigest,
} from "./apiV1StateCrypto.ts";
import {
  ApiV1StatePartition,
  assertApiV1StateFields,
  requireApiV1StateRecord,
} from "./apiV1StatePartition.ts";

const tokenStateFormatVersion = 1;
const lastUsedPersistenceIntervalMilliseconds = 60_000;

type StoredToken = ApiV1TokenDto & {
  digest: string;
};

type TokenState = {
  formatVersion: typeof tokenStateFormatVersion;
  tokens: StoredToken[];
};

function parseStoredToken(value: unknown, index: number): StoredToken {
  const pathLabel = `tokens[${index}]`;
  const record = requireApiV1StateRecord(value, pathLabel);

  assertApiV1StateFields(record, [
    "createdAt",
    "digest",
    "id",
    "lastUsedAt",
    "name",
    "prefix",
    "repositoryIds",
    "scopes",
  ], pathLabel);
  if (
    typeof record.digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.digest)
  ) {
    throw new Error(`${pathLabel}.digest is invalid.`);
  }
  const { digest, ...wire } = record;
  const token = parseApiV1TokenList({ tokens: [wire] })[0]!;

  return { ...token, digest };
}

function parseTokenState(value: unknown): TokenState {
  const record = requireApiV1StateRecord(value, "token state");

  assertApiV1StateFields(
    record,
    ["formatVersion", "tokens"],
    "token state",
  );
  if (
    record.formatVersion !== tokenStateFormatVersion ||
    !Array.isArray(record.tokens)
  ) {
    throw new Error("token state has an invalid format.");
  }
  return {
    formatVersion: tokenStateFormatVersion,
    tokens: record.tokens.map(parseStoredToken),
  };
}

function tokenDto({ digest: _digest, ...token }: StoredToken): ApiV1TokenDto {
  return token;
}

export class ApiV1TokenStore {
  readonly #lastPersistedUsage = new Map<string, number>();
  readonly #now: () => Date;
  readonly #partition: ApiV1StatePartition<TokenState>;

  constructor(directory: string, now: () => Date) {
    this.#now = now;
    this.#partition = new ApiV1StatePartition({
      createInitial: () => ({
        formatVersion: tokenStateFormatVersion,
        tokens: [],
      }),
      directory,
      fileName: "tokens.json",
      name: "token",
      parse: parseTokenState,
    });
  }

  authenticate(secret: string): Promise<ApiV1PrincipalDto | null> {
    return this.#partition.mutate((state) => {
      const secretDigest = createApiV1StateDigest(secret);
      const token = state.tokens.find((candidate) =>
        apiV1StateDigestsEqual(candidate.digest, secretDigest)
      );

      if (!token) return { changed: false, result: null };
      const timestamp = this.#timestamp();
      const persistedAt = this.#lastPersistedUsage.get(token.id) ??
        (token.lastUsedAt ? Date.parse(token.lastUsedAt) : -Infinity);
      const current = Date.parse(timestamp);
      const shouldPersist = current - persistedAt >=
        lastUsedPersistenceIntervalMilliseconds;

      token.lastUsedAt = timestamp;
      if (shouldPersist) this.#lastPersistedUsage.set(token.id, current);
      return {
        changed: shouldPersist,
        result: {
          id: token.id,
          kind: "automation" as const,
          name: token.name,
          repositoryIds: token.repositoryIds,
          scopes: token.scopes,
        },
      };
    });
  }

  createToken(
    request: ApiV1CreateTokenRequestDto,
  ): Promise<ApiV1CreatedTokenDto> {
    return this.#partition.mutate((state) => {
      const id = `api-token-${randomUUID()}`;
      const secret = `ctn_${randomBytes(32).toString("base64url")}`;
      const token: StoredToken = {
        createdAt: this.#timestamp(),
        digest: createApiV1StateDigest(secret),
        id,
        lastUsedAt: null,
        name: request.name,
        prefix: secret.slice(0, 12),
        repositoryIds: request.repositoryIds,
        scopes: request.scopes,
      };

      state.tokens.push(token);
      return {
        changed: true,
        result: { secret, token: tokenDto(token) },
      };
    });
  }

  listTokens(): Promise<ApiV1TokenDto[]> {
    return this.#partition.read((state) =>
      state.tokens
        .map(tokenDto)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    );
  }

  revokeToken(tokenId: string): Promise<boolean> {
    return this.#partition.mutate((state) => {
      const index = state.tokens.findIndex(({ id }) => id === tokenId);

      if (index < 0) return { changed: false, result: false };
      state.tokens.splice(index, 1);
      this.#lastPersistedUsage.delete(tokenId);
      return { changed: true, result: true };
    });
  }

  #timestamp() {
    const date = this.#now();

    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new Error("API state time source returned an invalid date.");
    }
    return date.toISOString();
  }
}
