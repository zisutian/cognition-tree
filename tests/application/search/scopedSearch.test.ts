// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { ScopedSearchService } from "../../../application/search/scopedSearch.ts";

describe("scoped search orchestration", () => {
  it("filters sources and catalog faults before loading any unauthorized content", async () => {
    const loadWorkspace = vi.fn(async () => ({ revision: "1", loadDocuments: async () => [] }));
    const loadJournal = vi.fn(async () => ({ revision: "1", loadDocuments: async () => [] }));
    const service = new ScopedSearchService({ createCorpusKey: () => "key", catalog: {
      listWorkspaces: async () => ({ ids: ["allowed", "private"], issues: [{ id: "private-broken", invalid: true }, { id: "allowed-broken", invalid: true }] }),
      loadWorkspace, loadJournal, loadTodo: loadJournal, isInvalidSource: () => false,
    } });
    const result = await service.search({ query: "text", domains: ["workspace", "journal"] }, { domains: ["workspace"], repositoryIds: ["allowed", "allowed-broken"] });
    expect(loadWorkspace).toHaveBeenCalledExactlyOnceWith("allowed");
    expect(loadJournal).not.toHaveBeenCalled();
    expect(result.faults).toEqual([{ code: "source_invalid", domain: "workspace", message: "Workspace search source contains invalid data", repositoryId: "allowed-broken" }]);
  });
});
