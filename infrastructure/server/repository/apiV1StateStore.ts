// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import type {
  ApiV1AuditEntryDto,
  ApiV1AuditPageDto,
  ApiV1CommittedCommandResultDto,
  ApiV1CreateTokenRequestDto,
  ApiV1CreatedTokenDto,
  ApiV1PrincipalDto,
  ApiV1TokenDto,
} from "../../../contracts/api/types.ts";
import { ApiV1AuditStore } from "./apiV1AuditStore.ts";
import {
  createApiV1CommandRequestDigest,
} from "./apiV1StateCrypto.ts";
import {
  ensureApiV1StateDirectory,
} from "./apiV1StatePartition.ts";
import {
  ApiV1IdempotencyConflictError,
  ApiV1ReceiptStore,
} from "./apiV1ReceiptStore.ts";
import { ApiV1TokenStore } from "./apiV1TokenStore.ts";

export { ApiV1IdempotencyConflictError } from "./apiV1ReceiptStore.ts";

export class ApiV1StateStore {
  readonly #audit: ApiV1AuditStore;
  readonly #directory: string;
  readonly #inFlightCommands = new Map<string, {
    promise: Promise<{
      replayed: boolean;
      result: ApiV1CommittedCommandResultDto;
    }>;
    requestDigest: string;
  }>();
  #initializePromise: Promise<void> | null = null;
  readonly #receipts: ApiV1ReceiptStore;
  readonly #tokens: ApiV1TokenStore;

  constructor(
    stateDirectory: string,
    { now = () => new Date() }: { now?: () => Date } = {},
  ) {
    this.#directory = path.join(path.resolve(stateDirectory), "api-v1");
    this.#audit = new ApiV1AuditStore(this.#directory);
    this.#receipts = new ApiV1ReceiptStore(this.#directory, now);
    this.#tokens = new ApiV1TokenStore(this.#directory, now);
  }

  initialize() {
    this.#initializePromise ??= ensureApiV1StateDirectory(this.#directory);
    return this.#initializePromise;
  }

  async authenticate(secret: string): Promise<ApiV1PrincipalDto | null> {
    await this.initialize();
    return this.#tokens.authenticate(secret);
  }

  async createToken(
    request: ApiV1CreateTokenRequestDto,
  ): Promise<ApiV1CreatedTokenDto> {
    await this.initialize();
    return this.#tokens.createToken(request);
  }

  async listTokens(): Promise<ApiV1TokenDto[]> {
    await this.initialize();
    return this.#tokens.listTokens();
  }

  async revokeToken(tokenId: string): Promise<boolean> {
    await this.initialize();
    return this.#tokens.revokeToken(tokenId);
  }

  async readReceipt(
    principalId: string,
    commandId: string,
    request: unknown,
  ): Promise<ApiV1CommittedCommandResultDto | null> {
    await this.initialize();
    return this.#receipts.read(principalId, commandId, request);
  }

  async saveReceipt(
    principalId: string,
    commandId: string,
    request: unknown,
    result: ApiV1CommittedCommandResultDto,
    auditEntry?: ApiV1AuditEntryDto,
  ) {
    await this.initialize();
    await this.#receipts.save(principalId, commandId, request, result);
    if (auditEntry) await this.#audit.append(auditEntry, true);
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
    const requestDigest = createApiV1CommandRequestDigest(request);
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

      if (receipt) {
        if (createAuditEntry) {
          await this.#audit.append(createAuditEntry(receipt), true);
        }
        return { replayed: true, result: receipt };
      }
      const result = await execute();

      await this.#receipts.save(principalId, commandId, request, result);
      if (createAuditEntry) {
        await this.#audit.append(createAuditEntry(result), true);
      }
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

  async appendAudit(entry: ApiV1AuditEntryDto) {
    await this.initialize();
    return this.#audit.append(entry);
  }

  async listAudit(input: {
    cursor: number;
    limit: number;
  }): Promise<ApiV1AuditPageDto> {
    await this.initialize();
    return this.#audit.list(input);
  }
}
