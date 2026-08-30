// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentScopeViolationError,
  createAgentSyntaxKnowledge,
  projectAgentSyntaxGuide,
  type AgentProposal,
  type AgentRuntimeToolCall,
  type AgentScope,
} from "../../../application/agent/index.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import {
  AgentSyntaxDescriptionSchema,
  agentToolDefinitions,
} from "../../../contracts/agent/tools.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import type { ApiSearchService } from "../api/search.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";
import { AgentServiceError } from "./errors.ts";
import { JournalAgentSessionTools } from "./journalSessionTools.ts";
import { toAgentProposalDto } from "./proposalCodec.ts";
import {
  journalToolIntent,
  todoToolIntent,
  workspaceToolIntent,
} from "./sessionToolProtocol.ts";
import type {
  AgentToolExecution,
  AgentToolSession,
} from "./sessionToolState.ts";
import { TodoAgentSessionTools } from "./todoSessionTools.ts";
import { WorkspaceAgentSessionTools } from "./workspaceSessionTools.ts";

export class AgentSessionTools {
  readonly #journal: JournalAgentSessionTools;
  readonly #runtime: ApiRuntime;
  readonly #search: ApiSearchService;
  readonly #todo: TodoAgentSessionTools;
  readonly #workspace: WorkspaceAgentSessionTools;

  constructor({
    builtInCatalog,
    catalog,
    runtime,
    search,
  }: {
    builtInCatalog: ApiBuiltInCatalog;
    catalog: WorkspaceRepositoryCatalog;
    runtime: ApiRuntime;
    search: ApiSearchService;
  }) {
    this.#journal = new JournalAgentSessionTools({ builtInCatalog, runtime });
    this.#runtime = runtime;
    this.#search = search;
    this.#todo = new TodoAgentSessionTools({ builtInCatalog, runtime });
    this.#workspace = new WorkspaceAgentSessionTools({ catalog, runtime });
  }

  async execute(
    record: AgentToolSession,
    call: AgentRuntimeToolCall,
  ): Promise<AgentToolExecution> {
    const definition = agentToolDefinitions.find(({ name }) =>
      name === call.name
    );

    if (!definition) throw new AgentScopeViolationError("Unknown Agent tool");
    const input = parseAgentSchema(definition.inputSchema, call.arguments);

    switch (definition.name) {
      case "list":
        return { result: await this.#listResources(record) };
      case "read":
        return {
          result: await this.#readResource(
            record,
            (input as { resourceId: string }).resourceId,
          ),
        };
      case "search":
        return {
          result: await this.#searchResources(
            record,
            (input as { query: string }).query,
          ),
        };
      case "describe_syntax":
        return { result: await this.#describeSyntax(record) };
      case "submit_proposal": {
        const proposal = await this.#submitProposal(record);

        return { proposal, result: toAgentProposalDto(proposal) };
      }
      default:
        return {
          result: await this.#stage(
            record,
            definition.domain,
            definition.name,
            input,
          ),
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
      return parseAgentSchema(AgentSyntaxDescriptionSchema, {
        available: false,
        reason: "The scoped Workspace repository has no active CTN syntax",
      });
    }
    record.syntaxKnowledge = createAgentSyntaxKnowledge(syntax);
    return parseAgentSchema(AgentSyntaxDescriptionSchema, {
      available: true,
      guide: projectAgentSyntaxGuide(syntax),
    });
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
    const response = await this.#search.searchAgent({
      domains: [scope.domain],
      limit: 100,
      query,
      ...(scope.domain === "workspace"
        ? { repositoryIds: [scope.repositoryId] }
        : {}),
    });

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
    domain: "workspace" | "journal" | "todo" | undefined,
    name: string,
    input: unknown,
  ) {
    const scope = record.controller.snapshot().scope;

    if (domain === "workspace" && scope.domain === "workspace") {
      return this.#workspace.stage(
        record,
        scope,
        workspaceToolIntent(name, input),
      );
    }
    if (domain === "journal" && scope.domain === "journal") {
      return this.#journal.stage(
        record,
        scope,
        journalToolIntent(name, input),
      );
    }
    if (domain === "todo" && scope.domain === "todo") {
      return this.#todo.stage(record, scope, todoToolIntent(name, input));
    }
    throw new AgentScopeViolationError("Unknown Agent tool");
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
