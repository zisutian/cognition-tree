// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoParseIndex } from "../../../core/todo/indexes/todoParseIndex";
import type { TodoContent } from "../../../core/todo/model/todoContent";
import type {
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositorySnapshot,
} from "../../persistence/versionedRepository";
import type {
  BuiltInDescriptor,
  BuiltInLocation,
} from "../../repository/builtInCatalog";

export type TodoRevision = `sha256:${string}`;
export type TodoLocalDraftRevision = `draft:${string}`;

export type TodoRepositoryBackend = VersionedRepositoryBackend<
  TodoContent,
  TodoRevision
>;
export type TodoRepositorySnapshot = VersionedRepositorySnapshot<
  TodoContent,
  TodoRevision,
  TodoLocalDraftRevision,
  TodoParseIndex
>;
export type TodoRepository = VersionedRepository<
  TodoContent,
  TodoRevision,
  TodoLocalDraftRevision,
  BuiltInLocation,
  TodoParseIndex
>;

export type TodoRepositoryProvider = {
  openTodo(descriptor: BuiltInDescriptor): TodoRepository;
};
