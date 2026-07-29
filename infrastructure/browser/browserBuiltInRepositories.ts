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
  JournalContentValidationError,
} from "../../core/journal/model/journalContent";
import {
  TodoContentValidationError,
} from "../../core/todo/model/todoContent";
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
): BrowserJournalStorage {
  return createBrowserVersionedContentStorage({
    codec: journalRepositoryCodec,
    createEmptyContent: createEmptyJournalContent,
    databaseName: browserJournalDatabaseName,
    expectedEpoch: journalStorageEpoch,
    indexedDb,
    isContentValidationError: (error) =>
      error instanceof JournalContentValidationError,
    serializeRevisionContent: serializeJournalRevisionContent,
    validateContent: validateJournalRepositoryContent,
    validateTransition: validateJournalRepositoryTransition,
  });
}

export function createBrowserTodoStorage(
  indexedDb: IDBFactory,
): BrowserTodoStorage {
  return createBrowserVersionedContentStorage({
    codec: todoRepositoryCodec,
    createEmptyContent: createEmptyTodoContent,
    databaseName: browserTodoDatabaseName,
    expectedEpoch: todoStorageEpoch,
    indexedDb,
    isContentValidationError: (error) =>
      error instanceof TodoContentValidationError,
    serializeRevisionContent: serializeTodoRevisionContent,
    validateContent: validateTodoRepositoryContent,
    validateTransition: validateTodoRepositoryTransition,
  });
}
