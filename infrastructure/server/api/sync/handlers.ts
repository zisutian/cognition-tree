// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { serializeJsonIteratively } from "../../../../contracts/common/json.ts";
import type { DomainChangeSetDto } from "../../../../contracts/common/domainChanges.ts";
import type {
  WorkspaceResourceVersionPolicy,
} from "../../../../application/workspace/commands/workspaceAgentCommandPreparation.ts";
import type {
  JournalDomainVersions,
} from "../../../../application/journal/journalDomainCommands.ts";
import type {
  TodoDomainVersions,
} from "../../../../application/todo/todoDomainCommands.ts";
import { ApiRequestError, apiNotFound } from "../http/errors.ts";
import {
  assertRepositoryAllowed,
  publishTrackedChanges,
  requireBuiltInCatalog,
  type ApiHandlerContext,
} from "../http/handlerContext.ts";
import {
  synchronizeApiJournal,
  synchronizeApiTodo,
  synchronizeApiWorkspace,
} from "./service.ts";
import {
  OperationAuditFinalizeError,
  OperationAuditUnavailableError,
  type TrustedClientOperationStore,
} from "../../../../application/operations/operationLedgerPort.ts";
import { readApiRuntimeNow } from "../http/runtime.ts";
import { VersionedContentCommitOutcomeUnknownError } from "../../../../application/persistence/versionedCommitErrors.ts";

async function publishApiChanges(
  context: ApiHandlerContext,
  changes: DomainChangeSetDto,
) {
  publishTrackedChanges(context, changes);
}

async function handleWorkspaceSync(
  context: ApiHandlerContext,
  repositoryId: string,
  mode: "commit" | "load",
  versionPolicy: WorkspaceResourceVersionPolicy,
) {
  assertRepositoryAllowed(context.principal, repositoryId);
  const store = await context.catalog.getStore(repositoryId);
  return synchronizeApiWorkspace({
    mode,
    observeRevision: (revision) =>
      context.revisionTracker.observeWorkspace(repositoryId, revision),
    publish: (changes) => publishApiChanges(context, changes),
    readJsonBody: context.readJsonBody,
    repositoryId,
    runtime: context.runtime,
    store,
    versionPolicy,
  });
}

async function handleJournalSync(
  context: ApiHandlerContext,
  mode: "commit" | "load",
  versionPolicy: JournalDomainVersions,
) {
  const store = await requireBuiltInCatalog(context.builtInCatalog)
    .getStore("journal");

  return synchronizeApiJournal({
    mode,
    observeRevision: (revision) =>
      context.revisionTracker.observeDomain("journal", revision),
    publish: (changes) => publishApiChanges(context, changes),
    readJsonBody: context.readJsonBody,
    runtime: context.runtime,
    store,
    versionPolicy,
  });
}

async function handleTodoSync(
  context: ApiHandlerContext,
  mode: "commit" | "load",
  versionPolicy: TodoDomainVersions,
) {
  const store = await requireBuiltInCatalog(context.builtInCatalog)
    .getStore("todo");

  return synchronizeApiTodo({
    mode,
    observeRevision: (revision) =>
      context.revisionTracker.observeDomain("todo", revision),
    publish: (changes) => publishApiChanges(context, changes),
    readJsonBody: context.readJsonBody,
    runtime: context.runtime,
    store,
    versionPolicy,
  });
}

function executeApiSync(
  context: ApiHandlerContext,
  versionPolicies: {
    journal: JournalDomainVersions;
    todo: TodoDomainVersions;
    workspace: WorkspaceResourceVersionPolicy;
  },
) {
  const operationId = context.operation.operationId;
  const mode = operationId.startsWith("get") ? "load" : "commit";

  if (
    operationId === "getWorkspaceSyncSnapshot" ||
    operationId === "putWorkspaceSyncSnapshot"
  ) {
    const repositoryId = context.route.repositoryId;

    if (!repositoryId) apiNotFound();
    return handleWorkspaceSync(
      context,
      repositoryId,
      mode,
      versionPolicies.workspace,
    );
  }
  return operationId === "getJournalSyncSnapshot" ||
      operationId === "putJournalSyncSnapshot"
    ? handleJournalSync(context, mode, versionPolicies.journal)
    : handleTodoSync(context, mode, versionPolicies.todo);
}

function intentDigest(value: unknown) {
  return `sha256:${createHash("sha256")
    .update(serializeJsonIteratively(value, { sortObjectKeys: true }))
    .digest("hex")}` as `sha256:${string}`;
}

export async function handleApiSync(
  context: ApiHandlerContext,
  versionPolicies: {
    journal: JournalDomainVersions;
    todo: TodoDomainVersions;
    workspace: WorkspaceResourceVersionPolicy;
  },
) {
  if (
    context.operation.method !== "PUT" ||
    context.principal.kind !== "trusted-client"
  ) {
    return executeApiSync(context, versionPolicies);
  }
  const ledger = context.operationLedger;

  if (!ledger) {
    throw new OperationAuditUnavailableError(
      "Operation audit is required for trusted-client writes",
    );
  }
  const store: TrustedClientOperationStore =
    context.operation.operationId === "putWorkspaceSyncSnapshot"
      ? {
          domain: "workspace",
          repositoryId: context.route.repositoryId ?? apiNotFound(),
        }
      : context.operation.operationId === "putJournalSyncSnapshot"
        ? { domain: "journal" }
        : { domain: "todo" };
  const occurredAt = readApiRuntimeNow(context.runtime).timestamp;
  const operationId = await ledger.beginAuthenticatedAttempt({
    occurredAt,
    principalId: context.principal.id,
    requestId: context.requestId,
    route: context.operation.operationId,
    store,
  });
  const auditedContext: ApiHandlerContext = {
    ...context,
    readJsonBody: async () => {
      const request = await context.readJsonBody() as {
        base: { revision: `sha256:${string}` };
      };

      await ledger.attachIntent(operationId, {
        beforeRevision: request.base.revision,
        intentDigest: intentDigest(request),
        updatedAt: readApiRuntimeNow(context.runtime).timestamp,
      });
      return request;
    },
  };

  try {
    const result = await executeApiSync(auditedContext, versionPolicies);

    if (!result.audit) {
      throw new Error("Trusted-client PUT did not produce sync audit facts");
    }
    await ledger.finalizeTrustedAttempt(operationId, {
      afterRevision: result.audit.afterRevision,
      changeMetadata: {
        blockIds: [...new Set(result.audit.changeMetadata.blockIds)],
        resourceIds: [...new Set(result.audit.changeMetadata.resourceIds)],
      },
      result: result.audit.outcome,
      updatedAt: readApiRuntimeNow(context.runtime).timestamp,
    });
    return result;
  } catch (error) {
    if (
      error instanceof OperationAuditUnavailableError ||
      error instanceof OperationAuditFinalizeError
    ) {
      throw error;
    }
    await ledger.finalizeTrustedAttempt(operationId, {
      afterRevision:
        error instanceof VersionedContentCommitOutcomeUnknownError
          ? error.currentRevision
          : null,
      changeMetadata: { blockIds: [], resourceIds: [] },
      result: error instanceof VersionedContentCommitOutcomeUnknownError
        ? "indeterminate"
        : error instanceof ApiRequestError && error.code === "merge_conflict"
          ? "conflict"
          : "failed",
      updatedAt: readApiRuntimeNow(context.runtime).timestamp,
    });
    throw error;
  }
}
