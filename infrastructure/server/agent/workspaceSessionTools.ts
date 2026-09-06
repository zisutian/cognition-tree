// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentScopeViolationError,
  agentSyntaxKnowledgeMatches,
  assertAgentResourceInScope,
  createAgentProposal,
  resolveWorkspaceAgentScope,
  type AgentProposal,
  type AgentScope,
} from "../../../application/agent/index.ts";
import { prepareAgentWorkspaceCommand } from "../../../application/workspace/commands/workspaceAgentCommandPreparation.ts";
import {
  projectWorkspaceAgentProposalReview,
  projectWorkspaceContentChanges,
} from "../../../application/workspace/commands/workspaceContentProjection.ts";
import type { CtnCompiledSyntax } from "../../../core/ctn/syntax/types.ts";
import type { AgentWorkspaceCommandIntentDto } from "../../../contracts/agent/tools.ts";
import type { ApiSearchResponseDto } from "../../../contracts/api/types.ts";
import type { WorkspaceRepositoryContentDto } from "../../../contracts/workspace/types.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { readApiRuntimeNow } from "../api/http/runtime.ts";
import {
  projectApiWorkspaceAnalysis,
  projectApiWorkspaceNote,
  projectApiWorkspaceTree,
} from "../api/resources/workspace.ts";
import { workspaceResourceVersions } from "../api/resources/versions.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";
import { AgentServiceError } from "../../../application/agentHost/errors.ts";
import { digestAgentProposal } from "./proposalCodec.ts";
import { syntaxRequiredResult } from "./sessionToolProtocol.ts";
import {
  resolveAgentStaging,
  type AgentStagingFor,
  type AgentToolSession,
} from "../../../application/agentHost/sessionToolState.ts";

type WorkspaceScope = Extract<AgentScope, { domain: "workspace" }>;
type WorkspaceStaging = AgentStagingFor<"workspace">;

export class WorkspaceAgentSessionTools {
  readonly #catalog: WorkspaceRepositoryCatalog;
  readonly #runtime: ApiRuntime;

  constructor({
    catalog,
    runtime,
  }: {
    catalog: WorkspaceRepositoryCatalog;
    runtime: ApiRuntime;
  }) {
    this.#catalog = catalog;
    this.#runtime = runtime;
  }

  async list(scope: WorkspaceScope) {
    const snapshot = await this.#loadSnapshot(scope);
    const analysis = projectApiWorkspaceAnalysis(snapshot.projection);
    const tree = projectApiWorkspaceTree(
      scope.repositoryId,
      snapshot.revision,
      analysis,
    );
    const resolved = resolveWorkspaceAgentScope(
      scope,
      snapshot.content.workspace,
    );

    return {
      resources: tree.nodes.filter((node) =>
        node.kind === "note"
          ? resolved.noteIds.has(node.noteId)
          : resolved.folderIds === null ||
            resolved.folderIds.has(node.folderId)
      ),
    };
  }

  async read(scope: WorkspaceScope, resourceId: string) {
    const snapshot = await this.#loadSnapshot(scope);
    const resolved = resolveWorkspaceAgentScope(
      scope,
      snapshot.content.workspace,
    );
    const analysis = projectApiWorkspaceAnalysis(snapshot.projection);

    if (resolved.noteIds.has(resourceId)) {
      const note = projectApiWorkspaceNote(analysis, resourceId);

      if (note) {
        const { writingGuide: _writingGuide, ...resource } = note;

        return resource;
      }
    }
    if (resolved.folderIds === null || resolved.folderIds.has(resourceId)) {
      const tree = projectApiWorkspaceTree(
        scope.repositoryId,
        snapshot.revision,
        analysis,
      );
      const folder = tree.nodes.find((node) =>
        node.kind === "folder" && node.folderId === resourceId
      );

      if (folder) return folder;
    }
    throw new AgentScopeViolationError();
  }

  async syntax(
    record: AgentToolSession,
    scope: WorkspaceScope,
  ): Promise<CtnCompiledSyntax | null> {
    if (record.staging) {
      if (record.staging.kind !== "workspace") {
        throw new AgentScopeViolationError("A proposal can only stage one store");
      }
      return record.staging.current.projection.workspaceSyntax?.syntax ?? null;
    }
    const snapshot = await this.#loadSnapshot(scope);

    return snapshot.projection.workspaceSyntax?.syntax ?? null;
  }

  async filterSearch(
    scope: WorkspaceScope,
    response: ApiSearchResponseDto,
  ) {
    const snapshot = await this.#loadSnapshot(scope);
    const resolved = resolveWorkspaceAgentScope(
      scope,
      snapshot.content.workspace,
    );

    return {
      ...response,
      results: response.results.filter((result) =>
        result.domain === "workspace" &&
        result.repositoryId === scope.repositoryId &&
        resolved.noteIds.has(result.resourceId)
      ),
    };
  }

  async stage(
    record: AgentToolSession,
    scope: WorkspaceScope,
    intent: AgentWorkspaceCommandIntentDto,
  ) {
    let staging = await resolveAgentStaging(
      record,
      "workspace",
      async () => {
        const base = await this.#loadSnapshot(scope);

        return {
          base,
          current: base,
          destructive: false,
          kind: "workspace",
          timestamp: readApiRuntimeNow(this.#runtime).timestamp,
        };
      },
    );
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
    this.#assertIntentScope(scope, staging.current.content.workspace, intent);
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

  async createProposal(
    staging: WorkspaceStaging,
    scope: WorkspaceScope,
    id: string,
  ): Promise<AgentProposal> {
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
    const descriptor = catalog.repositories.find(({ id: repositoryId }) =>
      repositoryId === scope.repositoryId
    );

    if (!descriptor) {
      throw new AgentServiceError(
        "not_found",
        "Workspace repository label is unavailable for proposal review",
      );
    }
    return createAgentProposal({
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
  }

  async assertScopeAvailable(scope: WorkspaceScope) {
    const snapshot = await this.#loadSnapshot(scope);

    resolveWorkspaceAgentScope(scope, snapshot.content.workspace);
  }

  #loadSnapshot(scope: WorkspaceScope) {
    return this.#catalog.getStore(scope.repositoryId)
      .then((store) => store.loadSnapshot());
  }

  #assertIntentScope(
    scope: WorkspaceScope,
    workspace: WorkspaceRepositoryContentDto["workspace"],
    intent: AgentWorkspaceCommandIntentDto,
  ) {
    const checkNote = (noteId: string) =>
      assertAgentResourceInScope(scope, {
        domain: "workspace",
        noteId,
        workspace,
      });
    const checkFolder = (folderId: string) =>
      assertAgentResourceInScope(scope, {
        domain: "workspace",
        folderId,
        workspace,
      });
    const checkParent = (folderId: string | null) => {
      if (folderId === null) {
        if (scope.target.kind !== "repository") {
          throw new AgentScopeViolationError();
        }
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
}
