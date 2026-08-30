// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentScopeUnavailableError,
  AgentScopeViolationError,
  agentSyntaxKnowledgeMatches,
  assertAgentResourceInScope,
  createAgentSyntaxKnowledge,
  createAgentProposal,
  projectAgentSyntaxGuide,
  resolveWorkspaceAgentScope,
  type AgentProposal,
  type AgentRuntimeToolCall,
  type AgentScope,
} from "../../../application/agent/index.ts";
import { prepareAgentJournalCommand } from "../../../application/journal/journalAgentCommandPreparation.ts";
import {
  projectJournalAgentProposalReview,
  projectJournalContentChanges,
} from "../../../application/journal/journalContentProjection.ts";
import {
  prepareAgentTodoCommand,
  type TodoAgentCommandIntent,
} from "../../../application/todo/todoAgentCommandPreparation.ts";
import {
  projectTodoAgentProposalReview,
  projectTodoContentChanges,
} from "../../../application/todo/todoContentProjection.ts";
import { prepareAgentWorkspaceCommand } from "../../../application/workspace/commands/workspaceAgentCommandPreparation.ts";
import {
  projectWorkspaceAgentProposalReview,
  projectWorkspaceContentChanges,
} from "../../../application/workspace/commands/workspaceContentProjection.ts";
import { isJournalEntryId } from "../../../core/journal/model/journalIdentity.ts";
import { isTodoCollectionId } from "../../../core/todo/model/todoIdentity.ts";
import { parseAgentSchema } from "../../../contracts/agent/parse.ts";
import {
  AgentSyntaxDescriptionSchema,
  agentToolDefinitions,
  type AgentJournalCommandIntentDto,
  type AgentTodoCommandIntentDto,
  type AgentWorkspaceCommandIntentDto,
} from "../../../contracts/agent/tools.ts";
import type { WorkspaceRepositoryContentDto } from "../../../contracts/workspace/types.ts";
import type { ApiSearchResponseDto } from "../../../contracts/api/types.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  projectApiJournalEntries,
  projectApiJournalEntry,
} from "../api/resources/journal.ts";
import {
  projectApiTodoCollection,
  projectApiTodoCollections,
} from "../api/resources/todo.ts";
import {
  projectApiWorkspaceAnalysis,
  projectApiWorkspaceNote,
  projectApiWorkspaceTree,
} from "../api/resources/workspace.ts";
import {
  journalResourceVersions,
  todoResourceVersions,
  workspaceResourceVersions,
} from "../api/resources/versions.ts";
import type { ApiSearchService } from "../api/search.ts";
import { AgentServiceError } from "./errors.ts";
import {
  journalToolIntent,
  syntaxRequiredResult,
  todoToolIntent,
  workspaceToolIntent,
} from "./sessionToolProtocol.ts";
import {
  digestAgentProposal,
  toAgentProposalDto,
} from "./proposalCodec.ts";
import type {
  AgentStaging,
  AgentToolExecution,
  AgentToolSession,
} from "./sessionToolState.ts";

export class AgentSessionTools {
  readonly #builtInCatalog: ApiBuiltInCatalog;
  readonly #catalog: WorkspaceRepositoryCatalog;
  readonly #runtime: ApiRuntime;
  readonly #search: ApiSearchService;

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
    this.#builtInCatalog = builtInCatalog;
    this.#catalog = catalog;
    this.#runtime = runtime;
    this.#search = search;
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
        return {
          result: await this.#listResources(record),
        };
      case "read":
        return {
          result: await this.#readResource(
            record,
            input as { resourceId: string },
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
        if (definition.domain === "workspace") {
          return {
            result: await this.#stageWorkspace(
              record,
              workspaceToolIntent(definition.name, input),
            ),
          };
        }
        if (definition.domain === "journal") {
          return {
            result: await this.#stageJournal(
              record,
              journalToolIntent(definition.name, input),
            ),
          };
        }
        if (definition.domain === "todo") {
          return {
            result: await this.#stageTodo(
              record,
              todoToolIntent(definition.name, input),
            ),
          };
        }
        throw new AgentScopeViolationError("Unknown Agent tool");
    }
  }

  async #listResources(record: AgentToolSession) {
    const scope = record.controller.snapshot().scope;

    if (scope.domain === "workspace") {
      const snapshot = await this.#catalog.getStore(scope.repositoryId)
        .then((store) => store.loadSnapshot());
      const analysis = projectApiWorkspaceAnalysis(snapshot.projection);
      const tree = projectApiWorkspaceTree(scope.repositoryId, snapshot.revision, analysis);
      const resolved = resolveWorkspaceAgentScope(scope, snapshot.content.workspace);

      return {
        resources: tree.nodes.filter((node) =>
          node.kind === "note"
            ? resolved.noteIds.has(node.noteId)
            : resolved.folderIds === null || resolved.folderIds.has(node.folderId)
        ),
      };
    }
    if (scope.domain === "journal") {
      const snapshot = await this.#builtInCatalog.getStore("journal").then((store) =>
        store.loadSnapshot()
      );
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
    const snapshot = await this.#builtInCatalog.getStore("todo").then((store) =>
      store.loadSnapshot()
    );
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

  async #readResource(
    record: AgentToolSession,
    input: { resourceId: string },
  ) {
    const scope = record.controller.snapshot().scope;

    if (scope.domain === "workspace") {
      const snapshot = await this.#catalog.getStore(scope.repositoryId)
        .then((store) => store.loadSnapshot());
      const resolved = resolveWorkspaceAgentScope(scope, snapshot.content.workspace);
      const analysis = projectApiWorkspaceAnalysis(snapshot.projection);

      if (resolved.noteIds.has(input.resourceId)) {
        const note = projectApiWorkspaceNote(analysis, input.resourceId);

        if (note) {
          const { writingGuide: _writingGuide, ...resource } = note;

          return resource;
        }
      }
      if (resolved.folderIds === null || resolved.folderIds.has(input.resourceId)) {
        const tree = projectApiWorkspaceTree(scope.repositoryId, snapshot.revision, analysis);
        const folder = tree.nodes.find((node) =>
          node.kind === "folder" && node.folderId === input.resourceId
        );

        if (folder) return folder;
      }
      throw new AgentScopeViolationError();
    }
    if (scope.domain === "journal") {
      assertAgentResourceInScope(scope, {
        domain: "journal",
        entryId: input.resourceId,
      });
      const snapshot = await this.#builtInCatalog.getStore("journal").then((store) =>
        store.loadSnapshot()
      );
      const parsed = isJournalEntryId(input.resourceId)
        ? snapshot.projection.getParsedEntry(input.resourceId)
        : null;

      if (!parsed) throw new AgentServiceError("not_found", "Journal entry does not exist");
      const { writingGuide: _writingGuide, ...resource } =
        projectApiJournalEntry(parsed);

      return resource;
    }
    assertAgentResourceInScope(scope, {
      collectionId: input.resourceId,
      domain: "todo",
    });
    const snapshot = await this.#builtInCatalog.getStore("todo").then((store) =>
      store.loadSnapshot()
    );
    const parsed = isTodoCollectionId(input.resourceId)
      ? snapshot.projection.getParsedCollection(input.resourceId)
      : null;

    if (!parsed) throw new AgentServiceError("not_found", "Todo collection does not exist");
    const collection = projectApiTodoCollection(
      parsed,
      this.#runtime.today(this.#runtime.now()),
    );
    const { writingGuide: _writingGuide, ...document } = collection.document;

    return { ...collection, document };
  }

  async #describeSyntax(record: AgentToolSession) {
    const scope = record.controller.snapshot().scope;
    let syntax;

    if (record.staging?.kind === "workspace") {
      syntax = record.staging.current.projection.workspaceSyntax?.syntax ?? null;
    } else if (record.staging?.kind === "journal" ||
      record.staging?.kind === "todo") {
      syntax = record.staging.current.projection.syntax;
    } else if (scope.domain === "workspace") {
      const snapshot = await this.#catalog.getStore(scope.repositoryId)
        .then((store) => store.loadSnapshot());

      syntax = snapshot.projection.workspaceSyntax?.syntax ?? null;
    } else if (scope.domain === "journal") {
      const snapshot = await this.#builtInCatalog.getStore("journal")
        .then((store) => store.loadSnapshot());

      syntax = snapshot.projection.syntax;
    } else {
      const snapshot = await this.#builtInCatalog.getStore("todo")
        .then((store) => store.loadSnapshot());

      syntax = snapshot.projection.syntax;
    }
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

    return this.#filterSearchResponse(scope, response);
  }

  async #filterSearchResponse(scope: AgentScope, response: ApiSearchResponseDto) {
    if (scope.domain === "journal") {
      return {
        ...response,
        results: response.results.filter((result) =>
          result.domain === "journal" &&
          (scope.entryIds === null || scope.entryIds.includes(result.resourceId))
        ),
      };
    }
    if (scope.domain === "todo") {
      return {
        ...response,
        results: response.results.filter((result) =>
          result.domain === "todo" &&
          (scope.collectionIds === null || scope.collectionIds.includes(result.resourceId))
        ),
      };
    }
    const snapshot = await this.#catalog.getStore(scope.repositoryId)
      .then((store) => store.loadSnapshot());
    const resolved = resolveWorkspaceAgentScope(scope, snapshot.content.workspace);

    return {
      ...response,
      results: response.results.filter((result) =>
        result.domain === "workspace" &&
        result.repositoryId === scope.repositoryId &&
        resolved.noteIds.has(result.resourceId)
      ),
    };
  }

  async #stageWorkspace(
    record: AgentToolSession,
    intent: AgentWorkspaceCommandIntentDto,
  ) {
    const scope = record.controller.snapshot().scope;

    if (scope.domain !== "workspace") throw new AgentScopeViolationError();
    let staging: Extract<AgentStaging, { kind: "workspace" }>;

    if (!record.staging) {
      const base = await this.#catalog.getStore(scope.repositoryId)
        .then((store) => store.loadSnapshot());

      staging = {
        base,
        current: base,
        destructive: false,
        kind: "workspace",
        timestamp: readApiRuntimeNow(this.#runtime).timestamp,
      };
    } else if (record.staging.kind === "workspace") {
      staging = record.staging;
    } else {
      throw new AgentScopeViolationError("A proposal can only stage one store");
    }
    if (
      (intent.kind === "create-note" || intent.kind === "replace-note-source") &&
      !agentSyntaxKnowledgeMatches(
        record.syntaxKnowledge,
        staging.current.projection.workspaceSyntax?.syntax ?? null,
      )
    ) {
      return syntaxRequiredResult(
        "Call describe_syntax before generating Workspace CTN text. If the syntax changed, read it again.",
      );
    }
    this.#assertWorkspaceIntentScope(scope, staging.current.content.workspace, intent);
    const prepared = prepareAgentWorkspaceCommand({
      intent,
      runtime: this.#runtime,
      snapshot: staging.current,
      versionPolicy: workspaceResourceVersions,
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

  async #stageJournal(
    record: AgentToolSession,
    intent: AgentJournalCommandIntentDto,
  ) {
    const scope = record.controller.snapshot().scope;

    if (scope.domain !== "journal") throw new AgentScopeViolationError();
    let staging: Extract<AgentStaging, { kind: "journal" }>;

    if (!record.staging) {
      const base = await this.#builtInCatalog.getStore("journal").then((store) =>
        store.loadSnapshot()
      );

      staging = {
        base,
        current: base,
        destructive: false,
        kind: "journal",
        timestamp: readApiRuntimeNow(this.#runtime).timestamp,
      };
    } else if (record.staging.kind === "journal") {
      staging = record.staging;
    } else {
      throw new AgentScopeViolationError("A proposal can only stage one store");
    }
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

  async #stageTodo(record: AgentToolSession, intent: AgentTodoCommandIntentDto) {
    const scope = record.controller.snapshot().scope;

    if (scope.domain !== "todo") throw new AgentScopeViolationError();
    let staging: Extract<AgentStaging, { kind: "todo" }>;

    if (!record.staging) {
      const base = await this.#builtInCatalog.getStore("todo").then((store) =>
        store.loadSnapshot()
      );

      staging = {
        base,
        current: base,
        destructive: false,
        kind: "todo",
        timestamp: readApiRuntimeNow(this.#runtime).timestamp,
      };
    } else if (record.staging.kind === "todo") {
      staging = record.staging;
    } else {
      throw new AgentScopeViolationError("A proposal can only stage one store");
    }
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

  async #submitProposal(record: AgentToolSession): Promise<AgentProposal> {
    const staging = record.staging;

    if (!staging) {
      throw new AgentServiceError("invalid_request", "No staged Agent changes exist");
    }
    const id = this.#runtime.createId();
    let proposal: AgentProposal;

    if (staging.kind === "workspace") {
      const scope = record.controller.snapshot().scope;

      if (scope.domain !== "workspace") throw new AgentScopeViolationError();
      const transition = projectWorkspaceContentChanges(
        scope.repositoryId,
        staging.base.content,
        staging.current.content,
        staging.timestamp,
        staging.base.projection,
        staging.current.projection,
        workspaceResourceVersions,
      );
      const catalog = await this.#catalog.listRepositories();
      const descriptor = catalog.repositories.find(({ id }) =>
        id === scope.repositoryId
      );

      if (!descriptor) {
        throw new AgentServiceError(
          "not_found",
          "Workspace repository label is unavailable for proposal review",
        );
      }

      proposal = createAgentProposal({
        base: staging.base,
        changes: transition.changes,
        destructive: staging.destructive,
        digestPort: { digest: digestAgentProposal },
        diff: transition.diff,
        id,
        review: projectWorkspaceAgentProposalReview({
          afterPreparation: staging.current.projection,
          beforePreparation: staging.base.projection,
          changes: transition.changes,
          repositoryLabel: descriptor.label,
        }),
        staged: staging.current,
        store: { domain: "workspace", repositoryId: scope.repositoryId },
      });
    } else if (staging.kind === "journal") {
      const transition = projectJournalContentChanges(
        staging.base.content,
        staging.current.content,
        staging.timestamp,
        staging.base.projection,
        staging.current.projection,
        journalResourceVersions,
      );

      proposal = createAgentProposal({
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
    } else {
      const transition = projectTodoContentChanges(
        staging.base.content,
        staging.current.content,
        staging.timestamp,
        staging.base.projection,
        staging.current.projection,
        todoResourceVersions,
      );

      proposal = createAgentProposal({
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
    record.staging = null;
    return proposal;
  }

  #assertWorkspaceIntentScope(
    scope: Extract<AgentScope, { domain: "workspace" }>,
    workspace: WorkspaceRepositoryContentDto["workspace"],
    intent: AgentWorkspaceCommandIntentDto,
  ) {
    const checkNote = (noteId: string) =>
      assertAgentResourceInScope(scope, { domain: "workspace", noteId, workspace });
    const checkFolder = (folderId: string) =>
      assertAgentResourceInScope(scope, { domain: "workspace", folderId, workspace });
    const checkParent = (folderId: string | null) => {
      if (folderId === null) {
        if (scope.target.kind !== "repository") throw new AgentScopeViolationError();
      } else {
        checkFolder(folderId);
      }
    };

    switch (intent.kind) {
      case "create-folder":
      case "create-note":
        checkParent(intent.parentFolderId);
        return;
      case "delete-folder":
      case "rename-folder":
        checkFolder(intent.folderId);
        return;
      case "delete-note":
      case "rename-note":
      case "replace-note-source":
        checkNote(intent.noteId);
        return;
      case "move-block":
        checkNote(intent.sourceNoteId);
        checkNote(intent.targetNoteId);
        return;
      case "move-tree-node":
        if (intent.nodeKind === "folder") checkFolder(intent.nodeId);
        else checkNote(intent.nodeId);
        checkParent(intent.parentFolderId);
    }
  }

  async assertScopeAvailable(scope: AgentScope) {
    await this.#scopeSnapshot(scope);
  }

  async #scopeSnapshot(scope: AgentScope) {
    const now = readApiRuntimeNow(this.#runtime).timestamp;

    if (scope.domain === "workspace") {
      const snapshot = await this.#catalog.getStore(scope.repositoryId)
        .then((store) => store.loadSnapshot());

      resolveWorkspaceAgentScope(scope, snapshot.content.workspace);
      return { now, snapshot };
    }
    if (scope.domain === "journal") {
      const snapshot = await this.#builtInCatalog.getStore("journal").then((store) =>
        store.loadSnapshot()
      );

      if (scope.entryIds !== null) {
        for (const entryId of scope.entryIds) {
          if (!isJournalEntryId(entryId) || !snapshot.projection.getParsedEntry(entryId)) {
            throw new AgentScopeUnavailableError(
              "A Journal entry selected as the Agent scope no longer exists",
            );
          }
        }
      }
      return { now, snapshot };
    }
    const snapshot = await this.#builtInCatalog.getStore("todo").then((store) =>
      store.loadSnapshot()
    );

    if (scope.collectionIds !== null) {
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
    return { now, snapshot };
  }

}
