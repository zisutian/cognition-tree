// SPDX-License-Identifier: GPL-3.0-or-later

import { chmod, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { serializeJsonIteratively } from "../../../contracts/common/json.ts";
import {
  isSecureDirectory,
  isSecureRegularFile,
  replaceFileDurably,
} from "../persistence/fileSystemPersistence.ts";

export class SecureStatePartitionError extends Error {
  readonly partition: string;

  constructor(partition: string, message: string) {
    super(`CTN ${partition} state is unavailable: ${message}`);
    this.name = "SecureStatePartitionError";
    this.partition = partition;
  }
}

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function ensureSecureStateDirectory(directory: string) {
  let stats;

  try {
    stats = await lstat(directory);
  } catch (error) {
    if (!isMissing(error)) throw error;
    await mkdir(directory, { mode: 0o700, recursive: true });
    stats = await lstat(directory);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("State directory is not a regular directory.");
  }
  if ((stats.mode & 0o777) !== 0o700) {
    await chmod(directory, 0o700);
    stats = await lstat(directory);
  }
  if (!isSecureDirectory(stats)) {
    throw new Error("State directory is not secure.");
  }
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

export class SecureJsonPartition<Value> {
  readonly #createInitial: () => Value;
  readonly #directory: string;
  readonly #file: string;
  #initializePromise: Promise<void> | null = null;
  readonly #name: string;
  #operationQueue: Promise<void> = Promise.resolve();
  readonly #parse: (value: unknown) => Value;
  #value: Value | null = null;

  constructor({
    createInitial,
    directory,
    fileName,
    name,
    parse,
  }: {
    createInitial(): Value;
    directory: string;
    fileName: string;
    name: string;
    parse(value: unknown): Value;
  }) {
    this.#createInitial = createInitial;
    this.#directory = path.resolve(directory);
    this.#file = path.join(this.#directory, fileName);
    this.#name = name;
    this.#parse = parse;
  }

  read<Result>(project: (value: Value) => Result): Promise<Result> {
    return this.#enqueue(async () => ({
      changed: false,
      result: project(this.#requireValue()),
    }));
  }

  mutate<Result>(
    operation: (
      value: Value,
    ) => PartitionMutation<Result> | Promise<PartitionMutation<Result>>,
  ): Promise<Result> {
    return this.#enqueue(async () => operation(this.#requireValue()));
  }

  async #initialize() {
    await ensureSecureStateDirectory(this.#directory);
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
      this.#value = this.#createInitial();
      await this.#save();
      return;
    }
    try {
      this.#value = this.#parse(JSON.parse(source) as unknown);
    } catch (error) {
      throw new SecureStatePartitionError(
        this.#name,
        error instanceof Error ? error.message : "invalid JSON",
      );
    }
  }

  async #enqueue<Result>(
    operation: () => Promise<PartitionMutation<Result>>,
  ): Promise<Result> {
    const pending = this.#operationQueue.then(async () => {
      this.#initializePromise ??= this.#initialize();
      await this.#initializePromise;
      const outcome = await operation();

      if (outcome.changed) await this.#save();
      return outcome.result;
    });

    this.#operationQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  #requireValue() {
    if (this.#value === null) {
      throw new Error(`CTN ${this.#name} partition is not initialized.`);
    }
    return this.#value;
  }

  #save() {
    return replaceFileDurably(
      this.#file,
      `${serializeJsonIteratively(this.#requireValue(), {
        indent: 2,
        sortObjectKeys: true,
      })}\n`,
      { hiddenTemporaryFile: true },
    );
  }
}
