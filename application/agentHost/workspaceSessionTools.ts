// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  WorkspaceRepositoryContent,
  WorkspaceCommandIntent,
} from '../workspace/index.ts';
import type { WorkspaceAgentToolPorts } from './workspaceToolPorts.ts';
import type { SearchResponse } from '../search/index.ts';
import { readCommandRuntimeNow } from '../commands/index.ts';

import {
  AgentScopeViolationError,
  agentSyntaxKnowledgeMatches,
  assertAgentResourceInScope,
  createAgentProposal,
  resolveWorkspaceAgentScope,
  type AgentProposal,
  type AgentScope,
} from "../agent/index.ts";
import {
  prepareWorkspaceCommand,
  projectWorkspaceContentReview,
  projectWorkspaceContentChanges,
} from "../workspace/index.ts";

import type { CtnCompiledSyntax } from "../../core/ctn/index.ts";
import { AgentServiceError } from "./errors.ts";
import { syntaxRequiredResult } from "./toolRequest.ts";
import {
  resolveAgentStaging,
  type AgentStagingFor,
  type AgentToolSession,
} from "./sessionToolState.ts";

type WorkspaceScope = Extract<AgentScope, { domain: "workspace" }>;
type WorkspaceStaging = AgentStagingFor<"workspace">;

export class WorkspaceAgentSessionTools {
  readonly #ports: WorkspaceAgentToolPorts;
  readonly #runtime: WorkspaceAgentToolPorts['runtime'];

  constructor(ports: WorkspaceAgentToolPorts) {
    this.#ports = ports;
    this.#runtime = ports.runtime;
  }

  async list(scope: WorkspaceScope) {
    const snapshot = await this.#loadSnapshot(scope);
    const tree = this.#ports.resources.tree(scope.repositoryId, snapshot);
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

    if (resolved.noteIds.has(resourceId)) {
      const note = this.#ports.resources.note(snapshot, resourceId);

      if (note) return note;
    }
    if (resolved.folderIds === null || resolved.folderIds.has(resourceId)) {
      const tree = this.#ports.resources.tree(scope.repositoryId, snapshot);
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
    response: SearchResponse,
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
    intent: WorkspaceCommandIntent,
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
          timestamp: readCommandRuntimeNow(this.#runtime).timestamp,
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
    const prepared = prepareWorkspaceCommand({
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
      this.#ports.versions,
    );
    const catalog = await this.#ports.listRepositories();
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
      digestPort: { digest: this.#ports.digest },
      diff: transition.diff,
      id,
      review: projectWorkspaceContentReview({
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
    return this.#ports.load(scope.repositoryId);
  }

  #assertIntentScope(
    scope: WorkspaceScope,
    workspace: WorkspaceRepositoryContent["workspace"],
    intent: WorkspaceCommandIntent,
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
