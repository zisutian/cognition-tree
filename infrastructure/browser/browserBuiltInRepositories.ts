// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJournalRevisionContent } from "../../contracts/journal/revision";
import { createEmptyJournalContent } from "../../contracts/journal/parseJournal";
import { journalStorageEpoch } from "../../contracts/journal/storageEpoch";
import type { JournalContentDto, JournalRevisionDto } from "../../contracts/journal/types";
import { createEmptyTodoContent } from "../../contracts/todo/parseTodo";
import { serializeTodoRevisionContent } from "../../contracts/todo/revision";
import { todoStorageEpoch } from "../../contracts/todo/storageEpoch";
import type { TodoContentDto, TodoRevisionDto } from "../../contracts/todo/types";
import {
  journalRepositoryCodec,
  validateJournalRepositoryContent,
  validateJournalRepositoryTransition,
} from "../persistence/journalRepository";
import {
  todoRepositoryCodec,
  validateTodoRepositoryContent,
  validateTodoRepositoryTransition,
} from "../persistence/todoRepository";
import {
  createBrowserVersionedContentStorage,
  type BrowserVersionedContentStorage,
} from "./browserVersionedContentStorage";

export const browserJournalDatabaseName = "cognition-tree.journal";
export const browserTodoDatabaseName = "cognition-tree.todo";
const oldDatabaseName = "cognition-tree.system-repositories";
const oldDatabaseVersion = 2;

function requestResult<Result>(request: IDBRequest<Result>) {
  return new Promise<Result>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed"))
    );
  });
}

function transactionComplete(transaction: IDBTransaction) {
  const completion = new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    );
  });

  void completion.catch(() => undefined);
  return completion;
}

function oldLocalStateBelongsTo(
  value: unknown,
  purpose: "system-journal" | "system-todo",
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as { content?: unknown; identity?: unknown };
  const content = state.content;

  return (
    content !== null &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    (content as { purpose?: unknown }).purpose === purpose
  ) || (
    typeof state.identity === "string" &&
    (state.identity === `browser-system:${purpose}` ||
      state.identity.includes(`#system:${purpose}#`))
  );
}

function removeOldPurposeFromCatalog(
  value: unknown,
  purpose: "system-journal" | "system-todo",
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const catalog = value as { issues?: unknown; repositories?: unknown };

  if (!Array.isArray(catalog.issues) || !Array.isArray(catalog.repositories)) {
    return null;
  }
  const belongsToPurpose = (entry: unknown) =>
    !!entry && typeof entry === "object" && !Array.isArray(entry) &&
    (entry as { id?: unknown }).id === purpose;
  const issues = catalog.issues.filter((entry) => !belongsToPurpose(entry));
  const repositories = catalog.repositories.filter(
    (entry) => !belongsToPurpose(entry),
  );

  return issues.length === catalog.issues.length &&
      repositories.length === catalog.repositories.length
    ? null
    : { ...catalog, issues, repositories };
}

async function clearOldPurposeData(
  indexedDb: IDBFactory,
  purpose: "system-journal" | "system-todo",
) {
  let created = false;
  const request = indexedDb.open(oldDatabaseName, oldDatabaseVersion);

  request.addEventListener("upgradeneeded", (event) => {
    created = (event as IDBVersionChangeEvent).oldVersion === 0;
  });
  const database = await requestResult(request);
  const stores = [
    "browser-remotes-v1",
    "local-states-v1",
    "catalog-v1",
    "storage-epochs-v1",
  ].filter((name) => database.objectStoreNames.contains(name));

  if (stores.length > 0) {
    const transaction = database.transaction(stores, "readwrite");
    const completion = transactionComplete(transaction);

    if (stores.includes("browser-remotes-v1")) {
      transaction.objectStore("browser-remotes-v1").delete(purpose);
    }
    if (stores.includes("storage-epochs-v1")) {
      transaction.objectStore("storage-epochs-v1").delete(purpose);
    }
    if (stores.includes("catalog-v1")) {
      const store = transaction.objectStore("catalog-v1");
      const [values, keys] = await Promise.all([
        requestResult(store.getAll()),
        requestResult(store.getAllKeys()),
      ]);

      values.forEach((value, index) => {
        const next = removeOldPurposeFromCatalog(value, purpose);

        if (next) store.put(next, keys[index]!);
      });
    }
    if (stores.includes("local-states-v1")) {
      const store = transaction.objectStore("local-states-v1");
      const [values, keys] = await Promise.all([
        requestResult(store.getAll()),
        requestResult(store.getAllKeys()),
      ]);

      values.forEach((value, index) => {
        if (oldLocalStateBelongsTo(value, purpose)) store.delete(keys[index]!);
      });
    }
    await completion;
  }
  database.close();
  if (created) {
    await requestResult(indexedDb.deleteDatabase(oldDatabaseName));
  }
}

export type BrowserJournalStorage = BrowserVersionedContentStorage<
  JournalContentDto,
  JournalRevisionDto
>;
export type BrowserTodoStorage = BrowserVersionedContentStorage<
  TodoContentDto,
  TodoRevisionDto
>;

export function createBrowserJournalStorage(
  indexedDb: IDBFactory,
  expectedEpoch = journalStorageEpoch,
): BrowserJournalStorage {
  return createBrowserVersionedContentStorage({
    clearPreviousData: () => clearOldPurposeData(indexedDb, "system-journal"),
    codec: journalRepositoryCodec,
    createEmptyContent: createEmptyJournalContent,
    databaseName: browserJournalDatabaseName,
    expectedEpoch,
    indexedDb,
    serializeRevisionContent: serializeJournalRevisionContent,
    validateContent: validateJournalRepositoryContent,
    validateTransition: validateJournalRepositoryTransition,
  });
}

export function createBrowserTodoStorage(
  indexedDb: IDBFactory,
  expectedEpoch = todoStorageEpoch,
): BrowserTodoStorage {
  return createBrowserVersionedContentStorage({
    clearPreviousData: () => clearOldPurposeData(indexedDb, "system-todo"),
    codec: todoRepositoryCodec,
    createEmptyContent: createEmptyTodoContent,
    databaseName: browserTodoDatabaseName,
    expectedEpoch,
    indexedDb,
    serializeRevisionContent: serializeTodoRevisionContent,
    validateContent: validateTodoRepositoryContent,
    validateTransition: validateTodoRepositoryTransition,
  });
}
