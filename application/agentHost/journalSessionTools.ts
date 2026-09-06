// SPDX-License-Identifier: GPL-3.0-or-later

import type { JournalAgentToolPorts } from './journalToolPorts.ts';
import type { SearchResponse } from '../search/index.ts';
import { readCommandRuntimeNow } from '../commands/index.ts';
import type { JournalAgentCommandIntent } from '../journal/index.ts';
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
  prepareAgentJournalCommand,
  projectJournalAgentProposalReview,
  projectJournalContentChanges,
} from "../journal/index.ts";

import type { CtnCompiledSyntax } from "../../core/ctn/index.ts";
import { isJournalEntryId } from "../../core/journal/index.ts";
import { AgentServiceError } from "./errors.ts";
import { syntaxRequiredResult } from "./toolRequest.ts";
import {
  resolveAgentStaging,
  type AgentStagingFor,
  type AgentToolSession,
} from "./sessionToolState.ts";

type JournalScope = Extract<AgentScope, { domain: "journal" }>;
type JournalStaging = AgentStagingFor<"journal">;

export class JournalAgentSessionTools {
  readonly #ports: JournalAgentToolPorts;
  readonly #runtime: JournalAgentToolPorts['runtime'];

  constructor(ports: JournalAgentToolPorts) {
    this.#ports = ports;
    this.#runtime = ports.runtime;
  }

  async list(scope: JournalScope) {
    const snapshot = await this.#loadSnapshot();
    const entries = this.#ports.resources.list(snapshot);

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
    return this.#ports.resources.read(parsed);
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

  filterSearch(scope: JournalScope, response: SearchResponse) {
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
    intent: JournalAgentCommandIntent,
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
          timestamp: readCommandRuntimeNow(this.#runtime).timestamp,
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
    staging: JournalStaging,
    id: string,
  ): AgentProposal {
    const transition = projectJournalContentChanges(
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
    return this.#ports.load();
  }
}
