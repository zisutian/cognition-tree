// SPDX-License-Identifier: GPL-3.0-or-later

import { serializeJournalRevisionContent } from "../../contracts/journal/revision";
import { createEmptyJournalContent } from "../../contracts/journal/parseJournal";
import { journalStorageEpoch } from "../../contracts/journal/storageEpoch";
import type { JournalContentDto, JournalRevisionDto } from "../../contracts/journal/types";
import { createEmptyTodoContent } from "../../contracts/todo/parseTodo";
import {
  prepareTodoV4EpochMigration,
} from "../../contracts/todo/migrations/todoV3ToV4";
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
  expectedEpoch: number = journalStorageEpoch,
): BrowserJournalStorage {
  return createBrowserVersionedContentStorage({
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
  expectedEpoch: number = todoStorageEpoch,
): BrowserTodoStorage {
  return createBrowserVersionedContentStorage({
    codec: todoRepositoryCodec,
    createEmptyContent: createEmptyTodoContent,
    databaseName: browserTodoDatabaseName,
    expectedEpoch,
    indexedDb,
    migration: {
      fromEpoch: 3,
      prepareContent: prepareTodoV4EpochMigration,
    },
    serializeRevisionContent: serializeTodoRevisionContent,
    validateContent: validateTodoRepositoryContent,
    validateTransition: validateTodoRepositoryTransition,
  });
}
