// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import type {
  ApiAuditEntryDto,
  ApiAuditPageDto,
  ApiCommittedCommandResultDto,
  ApiCreateTokenRequestDto,
  ApiCreatedTokenDto,
  ApiPrincipalDto,
  ApiTokenDto,
} from "../../../../contracts/api/types.ts";
import { ApiAuditStore } from "./auditStore.ts";
import {
  createApiCommandRequestDigest,
} from "./crypto.ts";
import {
  ensureApiStateDirectory,
} from "./partition.ts";
import {
  ApiIdempotencyConflictError,
  ApiReceiptStore,
} from "./receiptStore.ts";
import { ApiTokenStore } from "./tokenStore.ts";

export { ApiIdempotencyConflictError } from "./receiptStore.ts";

// This is a persisted layout name, not an HTTP namespace. Renaming it would
// silently strand existing token, audit, and idempotency receipt state.
const persistedApiStateDirectoryName = "api-v1";

export class ApiStateStore {
  readonly #audit: ApiAuditStore;
  readonly #directory: string;
  readonly #inFlightCommands = new Map<string, {
    promise: Promise<{
      replayed: boolean;
      result: ApiCommittedCommandResultDto;
    }>;
    requestDigest: string;
  }>();
  #initializePromise: Promise<void> | null = null;
  readonly #receipts: ApiReceiptStore;
  readonly #tokens: ApiTokenStore;

  constructor(
    stateDirectory: string,
    { now = () => new Date() }: { now?: () => Date } = {},
  ) {
    this.#directory = path.join(
      path.resolve(stateDirectory),
      persistedApiStateDirectoryName,
    );
    this.#audit = new ApiAuditStore(this.#directory);
    this.#receipts = new ApiReceiptStore(this.#directory, now);
    this.#tokens = new ApiTokenStore(this.#directory, now);
  }

  initialize() {
    this.#initializePromise ??= ensureApiStateDirectory(this.#directory);
    return this.#initializePromise;
  }

  async authenticate(secret: string): Promise<ApiPrincipalDto | null> {
    await this.initialize();
    return this.#tokens.authenticate(secret);
  }

  async createToken(
    request: ApiCreateTokenRequestDto,
  ): Promise<ApiCreatedTokenDto> {
    await this.initialize();
    return this.#tokens.createToken(request);
  }

  async listTokens(): Promise<ApiTokenDto[]> {
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
  ): Promise<ApiCommittedCommandResultDto | null> {
    await this.initialize();
    return this.#receipts.read(principalId, commandId, request);
  }

  async saveReceipt(
    principalId: string,
    commandId: string,
    request: unknown,
    result: ApiCommittedCommandResultDto,
    auditEntry?: ApiAuditEntryDto,
  ) {
    await this.initialize();
    await this.#receipts.save(principalId, commandId, request, result);
    if (auditEntry) await this.#audit.append(auditEntry, true);
  }

  runIdempotentCommand(
    principalId: string,
    commandId: string,
    request: unknown,
    execute: () => Promise<ApiCommittedCommandResultDto>,
    createAuditEntry?: (
      result: ApiCommittedCommandResultDto,
    ) => ApiAuditEntryDto,
  ): Promise<{
    replayed: boolean;
    result: ApiCommittedCommandResultDto;
  }> {
    const key = `${principalId}\u0000${commandId}`;
    const requestDigest = createApiCommandRequestDigest(request);
    const inFlight = this.#inFlightCommands.get(key);

    if (inFlight) {
      if (inFlight.requestDigest !== requestDigest) {
        return Promise.reject(new ApiIdempotencyConflictError());
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

  async appendAudit(entry: ApiAuditEntryDto) {
    await this.initialize();
    return this.#audit.append(entry);
  }

  async listAudit(input: {
    cursor: number;
    limit: number;
  }): Promise<ApiAuditPageDto> {
    await this.initialize();
    return this.#audit.list(input);
  }
}
