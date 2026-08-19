// SPDX-License-Identifier: GPL-3.0-or-later

import { randomBytes, randomUUID } from "node:crypto";
import type {
  ApiCreateTokenRequestDto,
  ApiCreatedTokenDto,
  ApiPrincipalDto,
  ApiTokenDto,
} from "../../../../contracts/api/types.ts";
import {
  parseApiTokenList,
} from "../../../../contracts/api/parse.ts";
import {
  apiStateDigestsEqual,
  createApiStateDigest,
} from "./crypto.ts";
import {
  ApiStatePartition,
  assertApiStateFields,
  requireApiStateRecord,
} from "./partition.ts";

const tokenStateFormatVersion = 1;
const lastUsedPersistenceIntervalMilliseconds = 60_000;

type StoredToken = ApiTokenDto & {
  digest: string;
};

type TokenState = {
  formatVersion: typeof tokenStateFormatVersion;
  tokens: StoredToken[];
};

function parseStoredToken(value: unknown, index: number): StoredToken {
  const pathLabel = `tokens[${index}]`;
  const record = requireApiStateRecord(value, pathLabel);

  assertApiStateFields(record, [
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
  const token = parseApiTokenList({ tokens: [wire] })[0]!;

  return { ...token, digest };
}

function parseTokenState(value: unknown): TokenState {
  const record = requireApiStateRecord(value, "token state");

  assertApiStateFields(
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

function tokenDto({ digest: _digest, ...token }: StoredToken): ApiTokenDto {
  return token;
}

export class ApiTokenStore {
  readonly #lastPersistedUsage = new Map<string, number>();
  readonly #now: () => Date;
  readonly #partition: ApiStatePartition<TokenState>;

  constructor(directory: string, now: () => Date) {
    this.#now = now;
    this.#partition = new ApiStatePartition({
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

  authenticate(secret: string): Promise<ApiPrincipalDto | null> {
    return this.#partition.mutate((state) => {
      const secretDigest = createApiStateDigest(secret);
      const token = state.tokens.find((candidate) =>
        apiStateDigestsEqual(candidate.digest, secretDigest)
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
    request: ApiCreateTokenRequestDto,
  ): Promise<ApiCreatedTokenDto> {
    return this.#partition.mutate((state) => {
      const id = `api-token-${randomUUID()}`;
      const secret = `ctn_${randomBytes(32).toString("base64url")}`;
      const token: StoredToken = {
        createdAt: this.#timestamp(),
        digest: createApiStateDigest(secret),
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

  listTokens(): Promise<ApiTokenDto[]> {
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
