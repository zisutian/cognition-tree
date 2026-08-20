// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoParseIndex } from "../../core/todo/indexes/todoParseIndex.ts";
import type { TodoContent } from "../../core/todo/model/todoContent.ts";
import type { TodoDomainVersions } from "./todoDomainCommands.ts";
import { projectTodoMutation } from "./todoDomainProjection.ts";

export function projectTodoContentChanges(
  before: TodoContent,
  after: TodoContent,
  timestamp: string,
  beforeIndex: TodoParseIndex,
  afterIndex: TodoParseIndex,
  versionPolicy: TodoDomainVersions,
) {
  return projectTodoMutation({
    after,
    afterIndex,
    before,
    beforeIndex,
    timestamp,
    versions: versionPolicy,
  });
}
