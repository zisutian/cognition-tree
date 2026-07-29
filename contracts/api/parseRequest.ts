// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseJournalCommit,
} from "../journal/parseJournal.ts";
import {
  parseTodoCommit,
} from "../todo/parseTodo.ts";
import {
  parseCreateRepository,
  parseRenameRepository,
} from "../workspace/parseCatalog.ts";
import {
  parseWorkspaceRepositoryCommit,
} from "../workspace/parseRepository.ts";
import type {
  ResolvedApiV1Route,
} from "./registry.ts";
import {
  parseApiV1CreateTokenRequest,
  parseApiV1JournalCommand,
  parseApiV1SearchRequest,
  parseApiV1TodoCommand,
  parseApiV1WorkspaceCommand,
} from "./parse.ts";

export function parseApiV1RouteRequestBody(
  route: ResolvedApiV1Route,
  method: string,
  input: unknown,
) {
  switch (route.requestBodyByMethod?.[method]) {
    case "create-repository":
      return parseCreateRepository(input);
    case "create-token":
      return parseApiV1CreateTokenRequest(input);
    case "journal-command":
      return parseApiV1JournalCommand(input);
    case "journal-sync":
      return parseJournalCommit(input);
    case "rename-repository":
      return parseRenameRepository(input);
    case "search":
      return parseApiV1SearchRequest(input);
    case "todo-command":
      return parseApiV1TodoCommand(input);
    case "todo-sync":
      return parseTodoCommit(input);
    case "workspace-command":
      return parseApiV1WorkspaceCommand(input);
    case "workspace-sync":
      return parseWorkspaceRepositoryCommit(input);
    case undefined:
      throw new Error(
        `API route ${method} ${route.path} does not accept a JSON body.`,
      );
  }
}
