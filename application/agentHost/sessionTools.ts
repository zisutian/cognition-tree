// SPDX-License-Identifier: GPL-3.0-or-later

import {
  toAgentProposalView,
  AgentScopeViolationError,
  createAgentSyntaxKnowledge,
  projectAgentSyntaxGuide,
  type AgentProposal,
  type AgentRuntimeToolCall,
  type AgentScope,
} from '../agent/index.ts';
import type {
  SearchQuery,
  SearchAccess,
} from '../search/index.ts';
import { searchDomains } from '../search/index.ts';

import type { CommandRuntime } from '../commands/index.ts';
import type { AgentToolDecoder, AgentToolRequest } from './toolRequest.ts';

import { AgentServiceError } from "./errors.ts";
import { JournalAgentSessionTools } from "./journalSessionTools.ts";
import type {
  AgentToolExecution,
  AgentToolSession,
} from "./sessionToolState.ts";
import { TodoAgentSessionTools } from "./todoSessionTools.ts";
import { WorkspaceAgentSessionTools } from "./workspaceSessionTools.ts";

export class AgentSessionTools {
  readonly #decoder: AgentToolDecoder;
  readonly #journal: JournalAgentSessionTools;
  readonly #runtime: CommandRuntime;
  readonly #search: SearchQuery<SearchAccess>;
  readonly #todo: TodoAgentSessionTools;
  readonly #workspace: WorkspaceAgentSessionTools;

  constructor({journal, todo, workspace, runtime, search, decoder}: {
    journal: JournalAgentSessionTools;
    todo: TodoAgentSessionTools;
    workspace: WorkspaceAgentSessionTools;
    runtime: CommandRuntime;
    search: SearchQuery<SearchAccess>;
    decoder: AgentToolDecoder;
  }) {
    this.#journal = journal;
    this.#todo = todo;
    this.#workspace = workspace;
    this.#runtime = runtime;
    this.#search = search;
    this.#decoder = decoder;
  }

  async execute(
    record: AgentToolSession,
    call: AgentRuntimeToolCall,
  ): Promise<AgentToolExecution> {
    const request = this.#decoder.decode(call);

    switch (request.kind) {
      case "list":
        return { result: await this.#listResources(record) };
      case "read":
        return {
          result: await this.#readResource(
            record,
            request.resourceId,
          ),
        };
      case "search":
        return {
          result: await this.#searchResources(
            record,
            request.query,
          ),
        };
      case "describe-syntax":
        return { result: await this.#describeSyntax(record) };
      case "submit-proposal": {
        const proposal = await this.#submitProposal(record);

        return { proposal, result: toAgentProposalView(proposal) };
      }
      default:
        return {
          result: await this.#stage(record, request),
        };
    }
  }

  async assertScopeAvailable(scope: AgentScope) {
    switch (scope.domain) {
      case "workspace":
        await this.#workspace.assertScopeAvailable(scope);
        return;
      case "journal":
        await this.#journal.assertScopeAvailable(scope);
        return;
      case "todo":
        await this.#todo.assertScopeAvailable(scope);
    }
  }

  #listResources(record: AgentToolSession) {
    const scope = record.controller.snapshot().scope;

    switch (scope.domain) {
      case "workspace":
        return this.#workspace.list(scope);
      case "journal":
        return this.#journal.list(scope);
      case "todo":
        return this.#todo.list(scope);
    }
  }

  #readResource(record: AgentToolSession, resourceId: string) {
    const scope = record.controller.snapshot().scope;

    switch (scope.domain) {
      case "workspace":
        return this.#workspace.read(scope, resourceId);
      case "journal":
        return this.#journal.read(scope, resourceId);
      case "todo":
        return this.#todo.read(scope, resourceId);
    }
  }

  async #describeSyntax(record: AgentToolSession) {
    const scope = record.controller.snapshot().scope;
    const syntax = await this.#readSyntax(record, scope);

    if (!syntax) {
      record.syntaxKnowledge = null;
      return {
        available: false,
        reason: "The scoped Workspace repository has no active CTN syntax",
      };
    }
    record.syntaxKnowledge = createAgentSyntaxKnowledge(syntax);
    return {
      available: true,
      guide: projectAgentSyntaxGuide(syntax),
    };
  }

  #readSyntax(record: AgentToolSession, scope: AgentScope) {
    switch (scope.domain) {
      case "workspace":
        return this.#workspace.syntax(record, scope);
      case "journal":
        return this.#journal.syntax(record);
      case "todo":
        return this.#todo.syntax(record);
    }
  }

  async #searchResources(record: AgentToolSession, query: string) {
    const scope = record.controller.snapshot().scope;
    const response = await this.#search.search({
      domains: [scope.domain],
      limit: 100,
      query,
      ...(scope.domain === "workspace"
        ? { repositoryIds: [scope.repositoryId] }
        : {}),
    }, {domains: searchDomains, repositoryIds: null});

    switch (scope.domain) {
      case "workspace":
        return this.#workspace.filterSearch(scope, response);
      case "journal":
        return this.#journal.filterSearch(scope, response);
      case "todo":
        return this.#todo.filterSearch(scope, response);
    }
  }

  #stage(
    record: AgentToolSession,
    request: Extract<AgentToolRequest, {kind: 'stage-workspace' | 'stage-journal' | 'stage-todo'}>,
  ) {
    const scope = record.controller.snapshot().scope;
    if (request.kind === 'stage-workspace' && scope.domain === 'workspace') {
      return this.#workspace.stage(record, scope, request.intent);
    }
    if (request.kind === 'stage-journal' && scope.domain === 'journal') {
      return this.#journal.stage(record, scope, request.intent);
    }
    if (request.kind === 'stage-todo' && scope.domain === 'todo') {
      return this.#todo.stage(record, scope, request.intent);
    }
    throw new AgentScopeViolationError('Unknown Agent tool');
  }

  async #submitProposal(record: AgentToolSession): Promise<AgentProposal> {
    const staging = record.staging;

    if (!staging) {
      throw new AgentServiceError(
        "invalid_request",
        "No staged Agent changes exist",
      );
    }
    const scope = record.controller.snapshot().scope;
    const id = this.#runtime.createId();
    let proposal: AgentProposal;

    if (staging.kind === "workspace" && scope.domain === "workspace") {
      proposal = await this.#workspace.createProposal(staging, scope, id);
    } else if (staging.kind === "journal" && scope.domain === "journal") {
      proposal = this.#journal.createProposal(staging, id);
    } else if (staging.kind === "todo" && scope.domain === "todo") {
      proposal = this.#todo.createProposal(staging, id);
    } else {
      throw new AgentScopeViolationError("A proposal can only stage one store");
    }
    record.staging = null;
    return proposal;
  }
}
