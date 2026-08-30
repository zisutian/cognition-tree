// SPDX-License-Identifier: GPL-3.0-or-later

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import {
  isSecureRegularFile,
  replaceFileDurably,
} from "../persistence/fileSystemPersistence.ts";
import { ensureSecureStateDirectory } from "./secureStateFileSystem.ts";

export class SecureStatePartitionError extends Error {
  readonly partition: string;

  constructor(partition: string, message: string) {
    super(`CTN ${partition} state is unavailable: ${message}`);
    this.name = "SecureStatePartitionError";
    this.partition = partition;
  }
}

export class SecureStateCommitOutcomeUnknownError extends SecureStatePartitionError {
  readonly commitOutcome = "unknown" as const;
  readonly cause: unknown;

  constructor(partition: string, cause: unknown) {
    super(partition, "durable write outcome could not be verified");
    this.name = "SecureStateCommitOutcomeUnknownError";
    this.cause = cause;
  }
}

class SecureStateLockReleaseError extends SecureStatePartitionError {
  readonly cause: unknown;

  constructor(partition: string, cause: unknown) {
    super(partition, "state lock could not be released");
    this.name = "SecureStateLockReleaseError";
    this.cause = cause;
  }
}

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function requireStateRecord(
  value: unknown,
  pathLabel: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${pathLabel} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function assertStateFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  pathLabel: string,
) {
  const expected = new Set(fields);
  const actual = Object.keys(value);

  if (actual.length !== expected.size || actual.some((key) => !expected.has(key))) {
    throw new Error(`${pathLabel} has unsupported or missing fields.`);
  }
}

type PartitionMutation<Result> = { changed: boolean; result: Result };
type PartitionOperation<Value, Result> = PartitionMutation<Result> & {
  candidate: Value;
};
type PersistedSourceObservation =
  | { kind: "missing" }
  | { kind: "source"; source: string }
  | { kind: "unavailable" };

export type SecureStateFileReplacer = (
  filePath: string,
  content: string,
  options?: { hiddenTemporaryFile?: boolean },
) => Promise<void>;

export type SecureStateLockAcquirer = () => Promise<() => Promise<void>>;

// Persisted values are JSON-like, but parsers may attach non-enumerable symbol
// metadata while migrating. Descriptor cloning preserves that transient state.
function clonePartitionValue<Value>(source: Value): Value {
  const clones = new WeakMap<object, object>();
  const clone = (value: unknown): unknown => {
    if (typeof value === "function") {
      throw new Error("Secure JSON partition values cannot contain functions.");
    }
    if (value === null || typeof value !== "object") return value;
    const existing = clones.get(value);

    if (existing) return existing;
    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);

    if (!isArray && prototype !== Object.prototype && prototype !== null) {
      throw new Error(
        "Secure JSON partition values can contain only plain objects and arrays.",
      );
    }
    const copy: object = isArray ? [] : Object.create(prototype) as object;

    clones.set(value, copy);
    for (const key of Reflect.ownKeys(value)) {
      if (isArray && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;

      if (!("value" in descriptor)) {
        throw new Error(
          "Secure JSON partition values cannot contain accessor properties.",
        );
      }
      Object.defineProperty(copy, key, {
        ...descriptor,
        value: clone(descriptor.value),
      });
    }
    if (isArray) {
      Object.defineProperty(
        copy,
        "length",
        Object.getOwnPropertyDescriptor(value, "length")!,
      );
    }
    return copy;
  };

  return clone(source) as Value;
}

export class SecureJsonPartition<Value> {
  readonly #acquireLock: SecureStateLockAcquirer;
  readonly #createInitial: () => Value;
  readonly #directory: string;
  readonly #file: string;
  #initializePromise: Promise<void> | null = null;
  readonly #name: string;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #parse: (value: unknown) => Value;
  #persistedSource: string | null = null;
  readonly #replaceFile: SecureStateFileReplacer;
  #terminalError: SecureStatePartitionError | null = null;
  #value: Value | null = null;

  constructor({
    createInitial,
    directory,
    fileName,
    name,
    parse,
    acquireLock,
    replaceFile = replaceFileDurably,
  }: {
    acquireLock?: SecureStateLockAcquirer;
    createInitial(): Value;
    directory: string;
    fileName: string;
    name: string;
    parse(value: unknown): Value;
    replaceFile?: SecureStateFileReplacer;
  }) {
    this.#createInitial = createInitial;
    this.#directory = path.resolve(directory);
    this.#file = path.join(this.#directory, fileName);
    this.#name = name;
    this.#parse = parse;
    this.#acquireLock = acquireLock ?? (() => lock(this.#directory, {
      lockfilePath: path.join(this.#directory, `.${fileName}.lock`),
      realpath: true,
      retries: { retries: 20, factor: 1, minTimeout: 5, maxTimeout: 20 },
      stale: 30_000,
      update: 10_000,
    }));
    this.#replaceFile = replaceFile;
  }

  read<Result>(project: (value: Value) => Result): Promise<Result> {
    return this.#enqueue(async (current) => {
      const candidate = clonePartitionValue(current);

      return {
        candidate,
        changed: false,
        result: project(candidate),
      };
    });
  }

  mutate<Result>(
    operation: (
      value: Value,
    ) => PartitionMutation<Result> | Promise<PartitionMutation<Result>>,
  ): Promise<Result> {
    return this.#enqueue(async (current) => {
      const candidate = clonePartitionValue(current);

      return { ...await operation(candidate), candidate };
    });
  }

  async #initialize() {
    let source: string;

    try {
      const stats = await lstat(this.#file);

      if (!isSecureRegularFile(stats)) {
        throw new Error("state file permissions or type are invalid");
      }
      source = await readFile(this.#file, "utf8");
    } catch (error) {
      if (!isMissing(error)) {
        throw new SecureStatePartitionError(
          this.#name,
          error instanceof Error ? error.message : "read failed",
        );
      }
      const initial = clonePartitionValue(this.#createInitial());
      const initialSource = this.#serialize(initial);

      try {
        await this.#save(initialSource);
      } catch (saveError) {
        const stored = await this.#observePersistedSource();

        if (stored.kind !== "missing") {
          this.#terminalError = new SecureStateCommitOutcomeUnknownError(
            this.#name,
            saveError,
          );
          throw this.#terminalError;
        }
        throw saveError;
      }
      this.#persistedSource = initialSource;
      this.#value = initial;
      return;
    }
    try {
      this.#value = clonePartitionValue(
        this.#parse(JSON.parse(source) as unknown),
      );
      this.#persistedSource = source;
    } catch (error) {
      throw new SecureStatePartitionError(
        this.#name,
        error instanceof Error ? error.message : "invalid JSON",
      );
    }
  }

  async #enqueue<Result>(
    operation: (current: Value) => Promise<PartitionOperation<Value, Result>>,
  ): Promise<Result> {
    const pending = this.#operationQueue.then(async () => {
      if (this.#terminalError) throw this.#terminalError;
      await ensureSecureStateDirectory(this.#directory);
      let release: () => Promise<void>;

      try {
        release = await this.#acquireLock();
      } catch (error) {
        throw new SecureStatePartitionError(
          this.#name,
          error instanceof Error && "code" in error && error.code === "ELOCKED"
            ? "state partition is busy"
            : "state lock could not be acquired",
        );
      }
      let operationFailed = false;

      try {
        await this.#ensureInitialized();
        await this.#refreshAuthority();
        if (this.#terminalError) throw this.#terminalError;
        const current = this.#requireValue();
        const outcome = await operation(current);

        if (outcome.changed) {
          // The operation may retain its candidate, so never install it directly.
          const committed = clonePartitionValue(outcome.candidate);
          const committedSource = this.#serialize(committed);

          try {
            await this.#save(committedSource);
          } catch (error) {
            const stored = await this.#observePersistedSource();

            if (
              stored.kind !== "source" ||
              stored.source !== this.#requirePersistedSource()
            ) {
              this.#terminalError = new SecureStateCommitOutcomeUnknownError(
                this.#name,
                error,
              );
              throw this.#terminalError;
            }
            throw error;
          }
          this.#persistedSource = committedSource;
          this.#value = committed;
        }
        // The operation only saw an isolated candidate, so its result cannot
        // retain a reference to the installed authority and need not be cloned.
        return outcome.result;
      } catch (error) {
        operationFailed = true;
        throw error;
      } finally {
        try {
          await release();
        } catch (error) {
          this.#terminalError ??= new SecureStateLockReleaseError(
            this.#name,
            error,
          );
          if (operationFailed) throw this.#terminalError;
        }
      }
    });

    this.#operationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  #ensureInitialized() {
    if (this.#initializePromise) return this.#initializePromise;
    this.#initializePromise = this.#initialize().catch((error: unknown) => {
      if (!this.#terminalError) this.#initializePromise = null;
      throw error;
    });
    return this.#initializePromise;
  }

  async #refreshAuthority() {
    const stored = await this.#observePersistedSource();

    if (
      stored.kind === "source" &&
      stored.source === this.#requirePersistedSource()
    ) return;
    if (stored.kind !== "source") {
      this.#terminalError ??= new SecureStatePartitionError(
        this.#name,
        "persisted state became unavailable",
      );
      throw this.#terminalError;
    }
    try {
      const refreshed = clonePartitionValue(
        this.#parse(JSON.parse(stored.source) as unknown),
      );

      this.#persistedSource = stored.source;
      this.#value = refreshed;
    } catch (error) {
      this.#terminalError ??= new SecureStatePartitionError(
        this.#name,
        error instanceof Error ? error.message : "invalid refreshed JSON",
      );
      throw this.#terminalError;
    }
  }

  #requireValue() {
    if (this.#value === null) {
      throw new Error(`CTN ${this.#name} partition is not initialized.`);
    }
    return this.#value;
  }

  #requirePersistedSource() {
    if (this.#persistedSource === null) {
      throw new Error(`CTN ${this.#name} partition is not initialized.`);
    }
    return this.#persistedSource;
  }

  async #observePersistedSource(): Promise<PersistedSourceObservation> {
    try {
      const stats = await lstat(this.#file);

      if (!isSecureRegularFile(stats)) return { kind: "unavailable" };
      return { kind: "source", source: await readFile(this.#file, "utf8") };
    } catch (error) {
      return isMissing(error) ? { kind: "missing" } : { kind: "unavailable" };
    }
  }

  #save(source: string) {
    return this.#replaceFile(
      this.#file,
      source,
      { hiddenTemporaryFile: true },
    );
  }

  #serialize(value: Value) {
    return `${serializeJsonIteratively(value, {
      indent: 2,
      sortObjectKeys: true,
    })}\n`;
  }
}
