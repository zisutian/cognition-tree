// SPDX-License-Identifier: GPL-3.0-or-later

import type { TodoAgentToolPorts } from './todoToolPorts.ts';
import type { SearchResponse } from '../search/index.ts';
import { readCommandRuntimeNow } from '../commands/index.ts';
import type { TodoAgentCommandIntent } from '../todo/index.ts';
import {
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  agentSyntaxKnowledgeMatches,
  assertAgentResourceInScope,
  createAgentProposal,
  type AgentProposal,
  type AgentScope,
} from "../agent/index.ts";
import {
  prepareAgentTodoCommand,
  projectTodoAgentProposalReview,
  projectTodoContentChanges,
} from "../todo/index.ts";

import type { CtnCompiledSyntax } from "../../core/ctn/index.ts";
import { isTodoCollectionId } from "../../core/todo/index.ts";
import { AgentServiceError } from "./errors.ts";
import { syntaxRequiredResult } from "./toolRequest.ts";
import {
  resolveAgentStaging,
  type AgentStagingFor,
  type AgentToolSession,
} from "./sessionToolState.ts";

type TodoScope = Extract<AgentScope, { domain: "todo" }>;
type TodoStaging = AgentStagingFor<"todo">;

export class TodoAgentSessionTools {
  readonly #ports: TodoAgentToolPorts;
  readonly #runtime: TodoAgentToolPorts['runtime'];

  constructor(ports: TodoAgentToolPorts) {
    this.#ports = ports;
    this.#runtime = ports.runtime;
  }

  async list(scope: TodoScope) {
    const snapshot = await this.#loadSnapshot();
    const collections = this.#ports.resources.list(snapshot);

    return {
      ...collections,
      collections: collections.collections.filter(({ id }) =>
        scope.collectionIds === null || scope.collectionIds.includes(id)
      ),
    };
  }

  async read(scope: TodoScope, resourceId: string) {
    assertAgentResourceInScope(scope, {
      collectionId: resourceId,
      domain: "todo",
    });
    const snapshot = await this.#loadSnapshot();
    const parsed = isTodoCollectionId(resourceId)
      ? snapshot.projection.getParsedCollection(resourceId)
      : null;

    if (!parsed) {
      throw new AgentServiceError(
        "not_found",
        "Todo collection does not exist",
      );
    }
    return this.#ports.resources.read(parsed, this.#runtime.today(this.#runtime.now()));
  }

  async syntax(
    record: AgentToolSession,
  ): Promise<CtnCompiledSyntax> {
    if (record.staging) {
      if (record.staging.kind !== "todo") {
        throw new AgentScopeViolationError("A proposal can only stage one store");
      }
      return record.staging.current.projection.syntax;
    }
    return (await this.#loadSnapshot()).projection.syntax;
  }

  filterSearch(scope: TodoScope, response: SearchResponse) {
    return {
      ...response,
      results: response.results.filter((result) =>
        result.domain === "todo" &&
        (scope.collectionIds === null ||
          scope.collectionIds.includes(result.resourceId))
      ),
    };
  }

  async stage(
    record: AgentToolSession,
    scope: TodoScope,
    intent: TodoAgentCommandIntent,
  ) {
    let staging = await resolveAgentStaging(
      record,
      "todo",
      async () => {
        const base = await this.#loadSnapshot();

        return {
          base,
          current: base,
          destructive: false,
          kind: "todo",
          timestamp: readCommandRuntimeNow(this.#runtime).timestamp,
        };
      },
    );
    if (
      (intent.kind === "create-collection" ||
        intent.kind === "replace-collection-body") &&
      !agentSyntaxKnowledgeMatches(
        record.syntaxKnowledge,
        staging.current.projection.syntax,
      )
    ) {
      return syntaxRequiredResult(
        "Call describe_syntax before generating Todo CTN text. If the syntax changed, read it again.",
      );
    }
    if (intent.kind === "create-collection" && scope.collectionIds !== null) {
      throw new AgentScopeViolationError();
    }
    if (intent.kind !== "create-collection") {
      assertAgentResourceInScope(scope, {
        collectionId: intent.collectionId,
        domain: "todo",
      });
    }
    const prepared = prepareAgentTodoCommand({
      intent,
      runtime: this.#runtime,
      snapshot: staging.current,
      versionPolicy: this.#ports.versions,
    });

    staging = {
      ...staging,
      current: {
        content: prepared.content,
        projection: prepared.projection,
        revision: staging.base.revision,
      },
      destructive: staging.destructive || prepared.destructive,
      timestamp: prepared.timestamp,
    };
    record.staging = staging;
    return { destructive: staging.destructive, staged: true };
  }

  createProposal(
    staging: TodoStaging,
    id: string,
  ): AgentProposal {
    const transition = projectTodoContentChanges(
      staging.base.content,
      staging.current.content,
      staging.timestamp,
      staging.base.projection,
      staging.current.projection,
      this.#ports.versions,
    );

    return createAgentProposal({
      base: staging.base,
      changes: transition.changes,
      destructive: staging.destructive,
      digestPort: { digest: this.#ports.digest },
      diff: transition.diff,
      id,
      review: projectTodoAgentProposalReview({
        afterIndex: staging.current.projection,
        beforeIndex: staging.base.projection,
        changes: transition.changes,
      }),
      staged: staging.current,
      store: { domain: "todo" },
    });
  }

  async assertScopeAvailable(scope: TodoScope) {
    const snapshot = await this.#loadSnapshot();

    if (scope.collectionIds === null) return;
    for (const collectionId of scope.collectionIds) {
      if (
        !isTodoCollectionId(collectionId) ||
        !snapshot.projection.getParsedCollection(collectionId)
      ) {
        throw new AgentScopeUnavailableError(
          "A Todo collection selected as the Agent scope no longer exists",
        );
      }
    }
  }

  #loadSnapshot() {
    return this.#ports.load();
  }
}
