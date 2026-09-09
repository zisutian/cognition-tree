import {
  createWorkspaceRepositoryRevision,
  createJournalRevision,
  createTodoRevision,
} from "../repository/index.ts";
// SPDX-License-Identifier: GPL-3.0-or-later

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
  if (!run || !builtIns || !ledger) return null;
  return new ContentService({
    catalog: { run },
    journal: () => builtIns.getStore("journal"),
    todo: () => builtIns.getStore("todo"),
    ledger,
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
