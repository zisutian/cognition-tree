// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJsonIteratively } from "../../../../../contracts/common/json.ts";
import { parseRepositoryRevision } from "../../../../../contracts/workspace/revision.ts";
import type { RepositoryRevisionDto } from "../../../../../contracts/workspace/types.ts";
import { RepositoryCorruptError } from "../../store.ts";

export type LocalTransactionFileOperation = {
  backupFile: string | null;
  baseHash: string;
  path: string;
  stagedFile: string | null;
  targetHash: string;
};

export type LocalTransactionManifest = {
  backupDirectories: string[];
  baseRevision: RepositoryRevisionDto;
  operations: LocalTransactionFileOperation[];
  schemaVersion: 1;
  targetDirectories: string[];
  targetRevision: RepositoryRevisionDto;
};

const manifestFields = new Set([
  "backupDirectories",
  "baseRevision",
  "operations",
  "schemaVersion",
  "targetDirectories",
  "targetRevision",
]);
const operationFields = new Set([
  "backupFile",
  "baseHash",
  "path",
  "stagedFile",
  "targetHash",
]);
const transactionPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLocalTransactionId(value: string) {
  return transactionPattern.test(value);
}

export function serializeLocalTransactionManifest(
  manifest: LocalTransactionManifest,
) {
  return `${serializeJsonIteratively(manifest, { indent: 2 })}\n`;
}

function isContentHash(value: unknown): value is string {
  return value === "absent" ||
    (typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value));
}

function assertSafeRelativePath(value: string, label: string) {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) =>
      !segment || segment === "." || segment === ".."
    )
  ) {
    throw new RepositoryCorruptError(`${label} is unsafe`);
  }
}

export function parseLocalTransactionManifest(
  value: unknown,
): LocalTransactionManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RepositoryCorruptError("Local transaction manifest is invalid");
  }
  const record = value as Record<string, unknown>;

  if (
    record.schemaVersion !== 1 ||
    Object.keys(record).some((key) => !manifestFields.has(key)) ||
    [...manifestFields].some((key) => !(key in record)) ||
    typeof record.baseRevision !== "string" ||
    typeof record.targetRevision !== "string" ||
    !Array.isArray(record.backupDirectories) ||
    !Array.isArray(record.operations) ||
    !Array.isArray(record.targetDirectories)
  ) {
    throw new RepositoryCorruptError("Local transaction manifest is invalid");
  }
  const operations = record.operations.map(
    (value, index): LocalTransactionFileOperation => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new RepositoryCorruptError("Local transaction operation is invalid");
      }
      const operation = value as Record<string, unknown>;

      if (
        Object.keys(operation).some((key) => !operationFields.has(key)) ||
        [...operationFields].some((key) => !(key in operation)) ||
        typeof operation.path !== "string" ||
        !isContentHash(operation.baseHash) ||
        !isContentHash(operation.targetHash) ||
        !(operation.backupFile === null ||
          typeof operation.backupFile === "string") ||
        !(operation.stagedFile === null ||
          typeof operation.stagedFile === "string")
      ) {
        throw new RepositoryCorruptError(
          `Local transaction operation ${index} is invalid`,
        );
      }
      assertSafeRelativePath(
        operation.path,
        `Local transaction operation ${index}`,
      );
      if (typeof operation.backupFile === "string") {
        assertSafeRelativePath(
          operation.backupFile,
          `Local transaction backup ${index}`,
        );
        if (!/^backup\/\d{6}$/.test(operation.backupFile)) {
          throw new RepositoryCorruptError(
            `Local transaction backup ${index} is invalid`,
          );
        }
      }
      if (typeof operation.stagedFile === "string") {
        assertSafeRelativePath(
          operation.stagedFile,
          `Local transaction staged file ${index}`,
        );
        if (!/^staged\/\d{6}$/.test(operation.stagedFile)) {
          throw new RepositoryCorruptError(
            `Local transaction staged file ${index} is invalid`,
          );
        }
      }
      return {
        backupFile: operation.backupFile,
        baseHash: operation.baseHash,
        path: operation.path,
        stagedFile: operation.stagedFile,
        targetHash: operation.targetHash,
      };
    },
  );
  const targetDirectories = record.targetDirectories.map((value, index) => {
    if (typeof value !== "string") {
      throw new RepositoryCorruptError(
        `Local transaction directory ${index} is invalid`,
      );
    }
    assertSafeRelativePath(value, `Local transaction directory ${index}`);
    return value;
  });
  const backupDirectories = record.backupDirectories.map((value, index) => {
    if (typeof value !== "string") {
      throw new RepositoryCorruptError(
        `Local transaction backup directory ${index} is invalid`,
      );
    }
    assertSafeRelativePath(
      value,
      `Local transaction backup directory ${index}`,
    );
    return value;
  });
  const operationPaths = operations.map((operation) => operation.path);
  const backupFiles = operations.flatMap((operation) =>
    operation.backupFile === null ? [] : [operation.backupFile]
  );
  const stagedFiles = operations.flatMap((operation) =>
    operation.stagedFile === null ? [] : [operation.stagedFile]
  );

  if (
    new Set(operationPaths).size !== operationPaths.length ||
    new Set(backupFiles).size !== backupFiles.length ||
    new Set(stagedFiles).size !== stagedFiles.length ||
    new Set(targetDirectories).size !== targetDirectories.length ||
    new Set(backupDirectories).size !== backupDirectories.length
  ) {
    throw new RepositoryCorruptError(
      "Local transaction manifest contains duplicate paths",
    );
  }
  let baseRevision: RepositoryRevisionDto;
  let targetRevision: RepositoryRevisionDto;

  try {
    baseRevision = parseRepositoryRevision(record.baseRevision);
    targetRevision = parseRepositoryRevision(record.targetRevision);
  } catch {
    throw new RepositoryCorruptError("Local transaction revisions are invalid");
  }
  return {
    backupDirectories,
    baseRevision,
    operations,
    schemaVersion: 1,
    targetDirectories,
    targetRevision,
  };
}
