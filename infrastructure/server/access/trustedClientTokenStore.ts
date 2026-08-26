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
} from "../state/secureJsonPartition.ts";
import { createStateDigest, stateDigestsEqual } from "../state/stateDigest.ts";

const formatVersion = 1;
const lastUsedPersistenceIntervalMilliseconds = 60_000;
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
  readonly #lastPersistedUsage = new Map<string, number>();
  readonly #now: () => Date;
  readonly #partition: SecureJsonPartition<TokenState>;

  constructor(
    stateDirectory: string,
    { now = () => new Date() }: { now?: () => Date } = {},
  ) {
    this.#now = now;
    this.#partition = new SecureJsonPartition({
      createInitial: () => ({ formatVersion, tokens: [] }),
      directory: path.join(path.resolve(stateDirectory), "access-v1"),
      fileName: "trusted-client-tokens.json",
      name: "trusted client access",
      parse: parseState,
    });
  }

  authenticate(secret: string): Promise<ApiPrincipalDto | null> {
    return this.#partition.mutate((state) => {
      const digest = createStateDigest(secret);
      const token = state.tokens.find((candidate) =>
        stateDigestsEqual(candidate.digest, digest)
      );

      if (!token) return { changed: false, result: null };
      const timestamp = this.#timestamp();
      const persistedAt = this.#lastPersistedUsage.get(token.id) ??
        (token.lastUsedAt ? Date.parse(token.lastUsedAt) : -Infinity);
      const current = Date.parse(timestamp);
      const changed = current - persistedAt >= lastUsedPersistenceIntervalMilliseconds;

      token.lastUsedAt = timestamp;
      if (changed) this.#lastPersistedUsage.set(token.id, current);
      return {
        changed,
        result: {
          id: token.id,
          kind: "trusted-client" as const,
          name: token.name,
        },
      };
    });
  }

  createToken(
    request: ApiCreateTrustedClientTokenRequestDto,
  ): Promise<ApiCreatedTrustedClientTokenDto> {
    return this.#partition.mutate((state) => {
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
    });
  }

  listTokens(): Promise<ApiTrustedClientTokenDto[]> {
    return this.#partition.read((state) =>
      state.tokens.map(tokenDto).sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      )
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
      throw new Error("Trusted client access time source returned an invalid date.");
    }
    return date.toISOString();
  }
}
