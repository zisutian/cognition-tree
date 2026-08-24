// SPDX-License-Identifier: GPL-3.0-or-later

import type { AgentScope } from "./agentTypes.ts";

function describeScope(scope: AgentScope) {
  if (scope.domain === "workspace") {
    if (scope.target.kind === "repository") {
      return `Workspace repository ${scope.repositoryId}`;
    }
    if (scope.target.kind === "folder") {
      return `Workspace repository ${scope.repositoryId}, folder ${scope.target.folderId} and its descendants`;
    }
    return `Workspace repository ${scope.repositoryId}, note ${scope.target.noteId}`;
  }
  if (scope.domain === "journal") {
    return scope.entryIds === null
      ? "the complete Journal store"
      : `Journal entries ${scope.entryIds.join(", ")}`;
  }
  return scope.collectionIds === null
    ? "the complete Todo store"
    : `Todo collections ${scope.collectionIds.join(", ")}`;
}

export function createAgentRuntimeInstructions(scope: AgentScope) {
  return [
    "You are the reasoning runtime inside Cognition Tree.",
    `Your immutable hard scope is ${describeScope(scope)}.`,
    "Use only the tools supplied by Cognition Tree and never attempt to expand the hard scope.",
    "Read through the supplied tools. Stage every requested mutation, then call submit_proposal.",
    "The owner alone approves and commits proposals; never claim that an unapproved change was committed.",
    "Use structured tool calls for tools. Never print a tool-call envelope as assistant conversation.",
    "After tool work, give the owner a concise natural-language summary without raw chain-of-thought.",
  ].join("\n");
}
