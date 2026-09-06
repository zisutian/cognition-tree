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
import { prepareAgentJournalCommand } from "../../../application/journal/journalAgentCommandPreparation.ts";
import {
  projectJournalAgentProposalReview,
  projectJournalContentChanges,
} from "../../../application/journal/journalContentProjection.ts";
import type { CtnCompiledSyntax } from "../../../core/ctn/syntax/types.ts";
import { isJournalEntryId } from "../../../core/journal/model/journalIdentity.ts";
import type { AgentJournalCommandIntentDto } from "../../../contracts/agent/tools.ts";
import type { ApiSearchResponseDto } from "../../../contracts/api/types.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  projectApiJournalEntries,
  projectApiJournalEntry,
} from "../api/resources/journal.ts";
import { journalResourceVersions } from "../api/resources/versions.ts";
import { AgentServiceError } from "../../../application/agentHost/errors.ts";
import { digestAgentProposal } from "./proposalCodec.ts";
import { syntaxRequiredResult } from "./sessionToolProtocol.ts";
import {
  resolveAgentStaging,
  type AgentStagingFor,
  type AgentToolSession,
} from "../../../application/agentHost/sessionToolState.ts";

type JournalScope = Extract<AgentScope, { domain: "journal" }>;
type JournalStaging = AgentStagingFor<"journal">;

export class JournalAgentSessionTools {
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

  async list(scope: JournalScope) {
    const snapshot = await this.#loadSnapshot();
    const entries = projectApiJournalEntries(
      snapshot.content,
      snapshot.projection,
      snapshot.revision,
    );

    return {
      ...entries,
      entries: entries.entries.filter(({ id }) =>
        scope.entryIds === null || scope.entryIds.includes(id)
      ),
    };
  }

  async read(scope: JournalScope, resourceId: string) {
    assertAgentResourceInScope(scope, {
      domain: "journal",
      entryId: resourceId,
    });
    const snapshot = await this.#loadSnapshot();
    const parsed = isJournalEntryId(resourceId)
      ? snapshot.projection.getParsedEntry(resourceId)
      : null;

    if (!parsed) {
      throw new AgentServiceError(
        "not_found",
        "Journal entry does not exist",
      );
    }
    const { writingGuide: _writingGuide, ...resource } =
      projectApiJournalEntry(parsed);

    return resource;
  }

  async syntax(
    record: AgentToolSession,
  ): Promise<CtnCompiledSyntax> {
    if (record.staging) {
      if (record.staging.kind !== "journal") {
        throw new AgentScopeViolationError("A proposal can only stage one store");
      }
      return record.staging.current.projection.syntax;
    }
    return (await this.#loadSnapshot()).projection.syntax;
  }

  filterSearch(scope: JournalScope, response: ApiSearchResponseDto) {
    return {
      ...response,
      results: response.results.filter((result) =>
        result.domain === "journal" &&
        (scope.entryIds === null || scope.entryIds.includes(result.resourceId))
      ),
    };
  }

  async stage(
    record: AgentToolSession,
    scope: JournalScope,
    intent: AgentJournalCommandIntentDto,
  ) {
    let staging = await resolveAgentStaging(
      record,
      "journal",
      async () => {
        const base = await this.#loadSnapshot();

        return {
          base,
          current: base,
          destructive: false,
          kind: "journal",
          timestamp: readApiRuntimeNow(this.#runtime).timestamp,
        };
      },
    );
    if (
      (intent.kind === "create-entry" || intent.kind === "replace-entry-body") &&
      !agentSyntaxKnowledgeMatches(
        record.syntaxKnowledge,
        staging.current.projection.syntax,
      )
    ) {
      return syntaxRequiredResult(
        "Call describe_syntax before generating Journal CTN text. If the syntax changed, read it again.",
      );
    }
    if (intent.kind === "create-entry" && scope.entryIds !== null) {
      throw new AgentScopeViolationError();
    }
    if (intent.kind !== "create-entry") {
      assertAgentResourceInScope(scope, {
        domain: "journal",
        entryId: intent.entryId,
      });
    }
    const prepared = prepareAgentJournalCommand({
      intent,
      runtime: this.#runtime,
      snapshot: staging.current,
      versionPolicy: journalResourceVersions,
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
    staging: JournalStaging,
    id: string,
  ): AgentProposal {
    const transition = projectJournalContentChanges(
      staging.base.content,
      staging.current.content,
      staging.timestamp,
      staging.base.projection,
      staging.current.projection,
      journalResourceVersions,
    );

    return createAgentProposal({
      base: staging.base,
      changes: transition.changes,
      destructive: staging.destructive,
      digestPort: { digest: digestAgentProposal },
      diff: transition.diff,
      id,
      review: projectJournalAgentProposalReview({
        afterIndex: staging.current.projection,
        beforeIndex: staging.base.projection,
        changes: transition.changes,
      }),
      staged: staging.current,
      store: { domain: "journal" },
    });
  }

  async assertScopeAvailable(scope: JournalScope) {
    const snapshot = await this.#loadSnapshot();

    if (scope.entryIds === null) return;
    for (const entryId of scope.entryIds) {
      if (
        !isJournalEntryId(entryId) ||
        !snapshot.projection.getParsedEntry(entryId)
      ) {
        throw new AgentScopeUnavailableError(
          "A Journal entry selected as the Agent scope no longer exists",
        );
      }
    }
  }

  #loadSnapshot() {
    return this.#builtInCatalog.getStore("journal")
      .then((store) => store.loadSnapshot());
  }
}
