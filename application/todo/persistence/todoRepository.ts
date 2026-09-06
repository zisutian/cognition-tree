// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  TodoParseIndex,
  TodoContent,
} from "../../../core/todo/index.ts";

import type {
  VersionedRepository,
  VersionedRepositoryBackend,
  VersionedRepositorySnapshot,
} from "../../persistence/index.ts";
import type {
  BuiltInDescriptor,
  BuiltInLocation,
} from "../../repository/index.ts";

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
