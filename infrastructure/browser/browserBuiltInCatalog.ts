// SPDX-License-Identifier: GPL-3.0-or-later

import {
  builtInLabel,
  parseBuiltInDescriptor,
  parseBuiltInId,
} from "../../contracts/built-ins/parseBuiltIns";
import type {
  BuiltInDescriptorDto,
  BuiltInIdDto,
  BuiltInIssueDto,
} from "../../contracts/built-ins/types";
import { createLocalFirstVersionedRepository } from "../persistence/resilientVersionedRepository";
import {
  mergeJournalContent,
  mergeTodoContent,
} from "../../application/sync/domainThreeWayMerge";
import {
  type BuiltInCatalog,
  type BuiltInLocation,
  type JournalRepository,
  type TodoRepository,
} from "../../application/repository/builtInRepository";
import {
  validateJournalRepositoryContent,
  validateJournalRepositoryTransition,
} from "../persistence/journalRepository";
import {
  validateTodoRepositoryContent,
  validateTodoRepositoryTransition,
} from "../persistence/todoRepository";
import { createVersionedLocalDraftRevision } from "../../application/persistence/versionedRepository";
import type {
  BrowserJournalStorage,
  BrowserTodoStorage,
} from "./browserBuiltInRepositories";

function descriptor(
  id: BuiltInIdDto,
  databaseName: string,
): BuiltInDescriptorDto {
  return {
    id,
    label: builtInLabel(id),
    location: { databaseName, type: "browser" },
    protected: true,
  };
}

function issue(
  id: BuiltInIdDto,
  location: BuiltInLocation,
  result: Exclude<Awaited<ReturnType<BrowserJournalStorage["inspect"]>>, {
    status: "ready";
  }>,
): BuiltInIssueDto {
  return {
    code: result.code,
    id,
    location,
    message: result.error instanceof Error
      ? result.error.message
      : `${builtInLabel(id)}存储不可用`,
    status: "fault",
  };
}

export function createBrowserBuiltInCatalog({
  journalStorage,
  todoStorage,
}: {
  journalStorage: BrowserJournalStorage;
  todoStorage: BrowserTodoStorage;
}): BuiltInCatalog {
  const journalDescriptor = descriptor("journal", journalStorage.databaseName);
  const todoDescriptor = descriptor("todo", todoStorage.databaseName);
  let journalRepository: JournalRepository | null = null;
  let todoRepository: TodoRepository | null = null;
  const createLocalRevision = () =>
    createVersionedLocalDraftRevision<`draft:${string}`>(
      () => globalThis.crypto.randomUUID(),
    );

  return {
    label: "Browser 内置数据",
    async listBuiltIns() {
      const [journal, todo] = await Promise.all([
        journalStorage.inspect(),
        todoStorage.inspect(),
      ]);
      return {
        issues: [
          ...(journal.status === "fault"
            ? [issue("journal", journalDescriptor.location, journal)]
            : []),
          ...(todo.status === "fault"
            ? [issue("todo", todoDescriptor.location, todo)]
            : []),
        ],
        repositories: [
          ...(journal.status === "ready" ? [journalDescriptor] : []),
          ...(todo.status === "ready" ? [todoDescriptor] : []),
        ],
      };
    },
    openJournal(value) {
      const parsed = parseBuiltInDescriptor(value);
      if (parsed.id !== "journal" || parsed.location.type !== "browser") {
        throw new Error("Browser Journal descriptor is invalid");
      }
      journalRepository ??= createLocalFirstVersionedRepository({
        backend: journalStorage.backend,
        cache: journalStorage.cache,
        createLocalRevision,
        label: parsed.label,
        location: parsed.location,
        mergeContent: mergeJournalContent,
        repositoryIdentity: "browser-built-in:journal",
        validateContent: validateJournalRepositoryContent,
        validateTransition: validateJournalRepositoryTransition,
      });
      return journalRepository;
    },
    openTodo(value) {
      const parsed = parseBuiltInDescriptor(value);
      if (parsed.id !== "todo" || parsed.location.type !== "browser") {
        throw new Error("Browser Todo descriptor is invalid");
      }
      todoRepository ??= createLocalFirstVersionedRepository({
        backend: todoStorage.backend,
        cache: todoStorage.cache,
        createLocalRevision,
        label: parsed.label,
        location: parsed.location,
        mergeContent: mergeTodoContent,
        repositoryIdentity: "browser-built-in:todo",
        validateContent: validateTodoRepositoryContent,
        validateTransition: validateTodoRepositoryTransition,
      });
      return todoRepository;
    },
    async retry(value) {
      const id = parseBuiltInId(value);
      const result = id === "journal"
        ? await journalStorage.inspect()
        : await todoStorage.inspect();

      return { status: result.status };
    },
  };
}
