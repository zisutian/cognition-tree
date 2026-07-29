// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { chmod, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import type {
  ApiV1AuditEntryDto,
  ApiV1AuditPageDto,
  ApiV1CommittedCommandResultDto,
  ApiV1CreateTokenRequestDto,
  ApiV1CreatedTokenDto,
  ApiV1PrincipalDto,
  ApiV1TokenDto,
} from "../../../contracts/api/types.ts";
import {
  parseApiV1AuditPage,
  parseApiV1TokenList,
} from "../../../contracts/api/parse.ts";
import {
  ApiV1CommittedCommandResultSchema,
} from "../../../contracts/api/schemas.ts";
import { parseApiV1Schema } from "../../../contracts/api/parse.ts";
import {
  isSecureDirectory,
  isSecureRegularFile,
  replaceFileDurably,
} from "../persistence/fileSystemPersistence.ts";

const stateSchemaVersion = 2;
const receiptRetentionMilliseconds = 30 * 24 * 60 * 60 * 1_000;
const stateFileName = "api-v1-state.json";

export class ApiV1IdempotencyConflictError extends Error {
  constructor() {
    super("commandId was already used with a different request");
    this.name = "ApiV1IdempotencyConflictError";
  }
}

type StoredToken = ApiV1TokenDto & {
  digest: string;
};

type StoredReceipt = {
  commandId: string;
  expiresAt: string;
  principalId: string;
  requestDigest: string;
  result: ApiV1CommittedCommandResultDto;
};

type StoredState = {
  audit: ApiV1AuditEntryDto[];
  receipts: StoredReceipt[];
  schemaVersion: typeof stateSchemaVersion;
  tokens: StoredToken[];
};

function digest(source: string) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function commandRequestDigest(value: unknown) {
  return digest(serializeJsonIteratively(value, { sortObjectKeys: true }));
}

function constantTimeDigestEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

function emptyState(): StoredState {
  return {
    audit: [],
    receipts: [],
    schemaVersion: stateSchemaVersion,
    tokens: [],
  };
}

function requireRecord(value: unknown, pathLabel: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${pathLabel} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  pathLabel: string,
) {
  const expected = new Set(fields);
  const actual = Object.keys(value);

  if (
    actual.length !== expected.size ||
    actual.some((key) => !expected.has(key))
  ) {
    throw new Error(`${pathLabel} has unsupported or missing fields.`);
  }
}

function parseStoredToken(value: unknown, index: number): StoredToken {
  const pathLabel = `tokens[${index}]`;
  const record = requireRecord(value, pathLabel);

  assertExactFields(record, [
    "createdAt",
    "digest",
    "id",
    "lastUsedAt",
    "name",
    "prefix",
    "repositoryIds",
    "scopes",
  ], pathLabel);
  if (typeof record.digest !== "string" || !/^[0-9a-f]{64}$/.test(record.digest)) {
    throw new Error(`${pathLabel}.digest is invalid.`);
  }
  const { digest: tokenDigest, ...dto } = record;
  const parsed = parseApiV1TokenList({ tokens: [dto] })[0]!;

  return { ...parsed, digest: tokenDigest };
}

function parseStoredReceipt(value: unknown, index: number): StoredReceipt {
  const pathLabel = `receipts[${index}]`;
  const record = requireRecord(value, pathLabel);

  assertExactFields(record, [
    "commandId",
    "expiresAt",
    "principalId",
    "requestDigest",
    "result",
  ], pathLabel);
  for (const key of ["commandId", "expiresAt", "principalId", "requestDigest"]) {
    if (typeof record[key] !== "string") {
      throw new Error(`${pathLabel}.${key} is invalid.`);
    }
  }
  if (
    !/^[0-9a-f]{64}$/.test(record.requestDigest as string) ||
    !Number.isFinite(Date.parse(record.expiresAt as string)) ||
    new Date(record.expiresAt as string).toISOString() !== record.expiresAt
  ) {
    throw new Error(`${pathLabel} digest or expiry is invalid.`);
  }
  const result = parseApiV1Schema(
    ApiV1CommittedCommandResultSchema,
    record.result,
  );
  return {
    commandId: record.commandId as string,
    expiresAt: record.expiresAt as string,
    principalId: record.principalId as string,
    requestDigest: record.requestDigest as string,
    result,
  };
}

function parseStoredState(value: unknown): StoredState {
  const record = requireRecord(value, "CTN API state");

  if (
    record.schemaVersion !== stateSchemaVersion ||
    !Array.isArray(record.tokens) ||
    !Array.isArray(record.receipts) ||
    !Array.isArray(record.audit)
  ) {
    throw new Error("CTN API state has an invalid schema.");
  }
  assertExactFields(
    record,
    ["audit", "receipts", "schemaVersion", "tokens"],
    "CTN API state",
  );
  return {
    audit: parseApiV1AuditPage({
      cursor: null,
      entries: record.audit,
    }).entries,
    receipts: record.receipts.map(parseStoredReceipt),
    schemaVersion: stateSchemaVersion,
    tokens: record.tokens.map(parseStoredToken),
  };
}

function tokenDto(token: StoredToken): ApiV1TokenDto {
  const { digest: _digest, ...dto } = token;

  return dto;
}

export class ApiV1StateStore {
  readonly #inFlightCommands = new Map<string, {
    promise: Promise<{
      replayed: boolean;
      result: ApiV1CommittedCommandResultDto;
    }>;
    requestDigest: string;
  }>();
  #initializePromise: Promise<void> | null = null;
  readonly #now: () => Date;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #stateDirectory: string;
  readonly #stateFile: string;
  #state: StoredState = emptyState();

  constructor(
    stateDirectory: string,
    { now = () => new Date() }: { now?: () => Date } = {},
  ) {
    this.#stateDirectory = path.resolve(stateDirectory);
    this.#stateFile = path.join(this.#stateDirectory, stateFileName);
    this.#now = now;
  }

  initialize() {
    this.#initializePromise ??= this.#initialize();
    return this.#initializePromise;
  }

  async authenticate(secret: string): Promise<ApiV1PrincipalDto | null> {
    return this.#enqueue(async () => {
      const secretDigest = digest(secret);
      const token = this.#state.tokens.find((candidate) =>
        constantTimeDigestEqual(candidate.digest, secretDigest)
      );

      if (!token) return null;
      token.lastUsedAt = this.#timestamp();
      await this.#save();
      return {
        id: token.id,
        kind: "automation",
        name: token.name,
        repositoryIds: token.repositoryIds,
        scopes: token.scopes,
      };
    });
  }

  createToken(
    request: ApiV1CreateTokenRequestDto,
  ): Promise<ApiV1CreatedTokenDto> {
    return this.#enqueue(async () => {
      const id = `api-token-${randomUUID()}`;
      const secret = `ctn_${randomBytes(32).toString("base64url")}`;
      const token: StoredToken = {
        createdAt: this.#timestamp(),
        digest: digest(secret),
        id,
        lastUsedAt: null,
        name: request.name,
        prefix: secret.slice(0, 12),
        repositoryIds: request.repositoryIds,
        scopes: request.scopes,
      };

      this.#state.tokens.push(token);
      await this.#save();
      return { secret, token: tokenDto(token) };
    });
  }

  listTokens(): Promise<ApiV1TokenDto[]> {
    return this.#enqueue(() =>
      Promise.resolve(
        this.#state.tokens
          .map(tokenDto)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      )
    );
  }

  revokeToken(tokenId: string): Promise<boolean> {
    return this.#enqueue(async () => {
      const index = this.#state.tokens.findIndex(({ id }) => id === tokenId);

      if (index < 0) return false;
      this.#state.tokens.splice(index, 1);
      await this.#save();
      return true;
    });
  }

  readReceipt(
    principalId: string,
    commandId: string,
    request: unknown,
  ): Promise<ApiV1CommittedCommandResultDto | null> {
    return this.#enqueue(async () => {
      const changed = this.#purgeExpiredReceipts();
      const receipt = this.#state.receipts.find(
        (candidate) =>
          candidate.principalId === principalId &&
          candidate.commandId === commandId,
      );

      if (changed) await this.#save();
      if (!receipt) return null;
      if (receipt.requestDigest !== commandRequestDigest(request)) {
        throw new ApiV1IdempotencyConflictError();
      }
      return receipt.result;
    });
  }

  saveReceipt(
    principalId: string,
    commandId: string,
    request: unknown,
    result: ApiV1CommittedCommandResultDto,
    auditEntry?: ApiV1AuditEntryDto,
  ) {
    return this.#enqueue(async () => {
      this.#purgeExpiredReceipts();
      const existing = this.#state.receipts.find(
        (candidate) =>
          candidate.principalId === principalId &&
          candidate.commandId === commandId,
      );
      const requestDigest = commandRequestDigest(request);

      if (existing) {
        if (existing.requestDigest !== requestDigest) {
          throw new ApiV1IdempotencyConflictError();
        }
        return;
      }
      this.#state.receipts.push({
        commandId,
        expiresAt: new Date(
          this.#now().getTime() + receiptRetentionMilliseconds,
        ).toISOString(),
        principalId,
        requestDigest,
        result,
      });
      if (auditEntry) this.#state.audit.push(auditEntry);
      await this.#save();
    });
  }

  runIdempotentCommand(
    principalId: string,
    commandId: string,
    request: unknown,
    execute: () => Promise<ApiV1CommittedCommandResultDto>,
    createAuditEntry?: (
      result: ApiV1CommittedCommandResultDto,
    ) => ApiV1AuditEntryDto,
  ): Promise<{
    replayed: boolean;
    result: ApiV1CommittedCommandResultDto;
  }> {
    const key = `${principalId}\u0000${commandId}`;
    const requestDigest = commandRequestDigest(request);
    const inFlight = this.#inFlightCommands.get(key);

    if (inFlight) {
      if (inFlight.requestDigest !== requestDigest) {
        return Promise.reject(new ApiV1IdempotencyConflictError());
      }
      return inFlight.promise.then(({ result }) => ({
        replayed: true,
        result,
      }));
    }
    const promise = (async () => {
      const receipt = await this.readReceipt(principalId, commandId, request);

      if (receipt) return { replayed: true, result: receipt };
      const result = await execute();

      await this.saveReceipt(
        principalId,
        commandId,
        request,
        result,
        createAuditEntry?.(result),
      );
      return { replayed: false, result };
    })();

    this.#inFlightCommands.set(key, { promise, requestDigest });
    void promise.finally(() => {
      if (this.#inFlightCommands.get(key)?.promise === promise) {
        this.#inFlightCommands.delete(key);
      }
    }).catch(() => undefined);
    return promise;
  }

  appendAudit(entry: ApiV1AuditEntryDto) {
    return this.#enqueue(async () => {
      this.#state.audit.push(entry);
      await this.#save();
    });
  }

  listAudit({
    cursor,
    limit,
  }: {
    cursor: number;
    limit: number;
  }): Promise<ApiV1AuditPageDto> {
    return this.#enqueue(() => {
      const entries = this.#state.audit
        .slice()
        .reverse()
        .slice(cursor, cursor + limit);
      const next = cursor + entries.length;

      return Promise.resolve({
        cursor: next < this.#state.audit.length ? String(next) : null,
        entries,
      });
    });
  }

  async #initialize() {
    await mkdir(this.#stateDirectory, { mode: 0o700, recursive: true });
    await chmod(this.#stateDirectory, 0o700);
    const directoryStats = await lstat(this.#stateDirectory);

    if (!isSecureDirectory(directoryStats)) {
      throw new Error("CTN API state directory is not secure.");
    }
    let source: string;

    try {
      const stats = await lstat(this.#stateFile);

      if (!isSecureRegularFile(stats)) {
        throw new Error("CTN API state file is not secure.");
      }
      source = await readFile(this.#stateFile, "utf8");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        this.#state = emptyState();
        await this.#save();
        return;
      }
      throw error;
    }
    try {
      this.#state = parseStoredState(JSON.parse(source) as unknown);
    } catch (error) {
      throw new Error(
        `CTN API state is corrupt: ${
          error instanceof Error ? error.message : "invalid JSON"
        }`,
      );
    }
    this.#purgeExpiredReceipts();
    await this.#save();
  }

  #purgeExpiredReceipts() {
    const now = this.#now().getTime();
    const previousLength = this.#state.receipts.length;

    this.#state.receipts = this.#state.receipts.filter(
      ({ expiresAt }) => Date.parse(expiresAt) > now,
    );
    return previousLength !== this.#state.receipts.length;
  }

  #timestamp() {
    const date = this.#now();

    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new Error("API state time source returned an invalid date.");
    }
    return date.toISOString();
  }

  #save() {
    return replaceFileDurably(
      this.#stateFile,
      `${serializeJsonIteratively(this.#state, {
        indent: 2,
        sortObjectKeys: true,
      })}\n`,
      { hiddenTemporaryFile: true },
    );
  }

  async #enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operationQueue.then(async () => {
      await this.initialize();
      return operation();
    });

    this.#operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}
