// SPDX-License-Identifier: GPL-3.0-or-later

import {
  createWorkspaceRepositoryRevision,
  createJournalRevision,
  createTodoRevision,
} from "../repository/index.ts";

import { OperationAuditUnavailableError } from "../../../application/operations/index.ts";
import { ContentService } from "../../../application/content/index.ts";
import type { ApiHttpDependencies } from "../api/http/index.ts";
import {
  createApiResourceVersion,
  journalResourceVersions,
  todoResourceVersions,
  workspaceResourceVersions,
} from "../api/resources/index.ts";
import { createServerContentEvents } from "./contentEventRuntime.ts";

export function createServerContentService(
  input: Pick<
    ApiHttpDependencies,
    | "builtInCatalog"
    | "catalog"
    | "operationLedger"
    | "runtime"
    | "eventHub"
    | "revisionTracker"
  >,
): ContentService | null {
  const run = input.catalog.runContentCatalog?.bind(input.catalog);
  const builtIns = input.builtInCatalog;
  const ledger = input.operationLedger;
  if (!run) return null;
  return new ContentService({
    catalog: { run },
    journal: async () => {
      if (!builtIns) throw new Error("Journal is unavailable");
      return builtIns.getStore("journal");
    },
    todo: async () => {
      if (!builtIns) throw new Error("Todo is unavailable");
      return builtIns.getStore("todo");
    },
    ledger: ledger ?? {
      getContentOperation: async () => null,
      runContentOperation: async () => {
        throw new OperationAuditUnavailableError(
          "Content operation receipts are unavailable.",
        );
      },
    },
    digest: createApiResourceVersion,
    runtime: input.runtime,
    revisions: {
      workspace: createWorkspaceRepositoryRevision,
      journal: createJournalRevision,
      todo: createTodoRevision,
    },
    versions: {
      workspace: workspaceResourceVersions,
      journal: journalResourceVersions,
      todo: todoResourceVersions,
    },
    ...createServerContentEvents(input),
  });
}
