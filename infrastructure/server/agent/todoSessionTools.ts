// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  agentSyntaxKnowledgeMatches,
  assertAgentResourceInScope,
  createAgentProposal,
  type AgentProposal,
  type AgentScope,
} from "../../../application/agent/index.ts";
import {
  prepareAgentTodoCommand,
  type TodoAgentCommandIntent,
} from "../../../application/todo/todoAgentCommandPreparation.ts";
import {
  projectTodoAgentProposalReview,
  projectTodoContentChanges,
} from "../../../application/todo/todoContentProjection.ts";
import type { CtnCompiledSyntax } from "../../../core/ctn/syntax/types.ts";
import { isTodoCollectionId } from "../../../core/todo/model/todoIdentity.ts";
import type { AgentTodoCommandIntentDto } from "../../../contracts/agent/tools.ts";
import type { ApiSearchResponseDto } from "../../../contracts/api/types.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  projectApiTodoCollection,
  projectApiTodoCollections,
} from "../api/resources/todo.ts";
import { todoResourceVersions } from "../api/resources/versions.ts";
import { AgentServiceError } from "../../../application/agentHost/errors.ts";
import { digestAgentProposal } from "./proposalCodec.ts";
import { syntaxRequiredResult } from "./sessionToolProtocol.ts";
import {
  resolveAgentStaging,
  type AgentStagingFor,
  type AgentToolSession,
} from "../../../application/agentHost/sessionToolState.ts";

type TodoScope = Extract<AgentScope, { domain: "todo" }>;
type TodoStaging = AgentStagingFor<"todo">;

export class TodoAgentSessionTools {
  readonly #builtInCatalog: ApiBuiltInCatalog;
  readonly #runtime: ApiRuntime;

  constructor({
    builtInCatalog,
    runtime,
  }: {
    builtInCatalog: ApiBuiltInCatalog;
    runtime: ApiRuntime;
  }) {
    this.#builtInCatalog = builtInCatalog;
    this.#runtime = runtime;
  }

  async list(scope: TodoScope) {
    const snapshot = await this.#loadSnapshot();
    const collections = projectApiTodoCollections(
      snapshot.content,
      snapshot.projection,
      snapshot.revision,
    );

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
    const collection = projectApiTodoCollection(
      parsed,
      this.#runtime.today(this.#runtime.now()),
    );
    const { writingGuide: _writingGuide, ...document } = collection.document;

    return { ...collection, document };
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

  filterSearch(scope: TodoScope, response: ApiSearchResponseDto) {
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
    intent: AgentTodoCommandIntentDto,
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
          timestamp: readApiRuntimeNow(this.#runtime).timestamp,
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
      intent: intent as TodoAgentCommandIntent,
      runtime: this.#runtime,
      snapshot: staging.current,
      versionPolicy: todoResourceVersions,
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
      todoResourceVersions,
    );

    return createAgentProposal({
      base: staging.base,
      changes: transition.changes,
      destructive: staging.destructive,
      digestPort: { digest: digestAgentProposal },
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
    return this.#builtInCatalog.getStore("todo")
      .then((store) => store.loadSnapshot());
  }
}
