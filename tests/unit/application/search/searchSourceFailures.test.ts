// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createSearchQuery } from "../../../../application/search/searchIndex.ts";
import type {
  SearchDocument,
  SearchSource,
} from "../../../../application/search/searchTypes.ts";

const corpusKey = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function document(id: string, domain: "journal" | "todo"): SearchDocument {
  return {
    blocks: [],
    domain,
    editableText: "needle",
    resourceId: id,
    title: id,
    updatedAt: "2026-09-14T00:00:00.000Z",
    version: `sha256:${"a".repeat(64)}`,
  };
}

describe("search source failure isolation", () => {
  it("reuses complete query results after source-document cache eviction", async () => {
    let projections = 0;
    const query = createSearchQuery({
      createCorpusKey: corpusKey,
      maximumCachedSources: 0,
      sourceProvider: {
        async listSources() {
          return {
            faults: [],
            sources: [
              {
                domain: "todo" as const,
                async load() {
                  return {
                    revision: "todo-1",
                    async loadDocuments() {
                      projections += 1;
                      return [document("first", "todo")];
                    },
                  };
                },
              },
            ],
          };
        },
      },
    });
    const first = await query.search({ query: "needle" }, undefined);
    expect(await query.search({ query: "needle" }, undefined)).toEqual(first);
    expect(projections).toBe(1);
  });

  it.each(["snapshot", "documents"] as const)(
    "keeps healthy pages available when a source fails during %s loading",
    async (stage) => {
      let healthyProjections = 0;
      const fail = () => {
        throw new Error("private source details");
      };
      const sources: SearchSource[] = [
        {
          domain: "journal",
          async load() {
            if (stage === "snapshot") fail();
            return { revision: "journal-1", loadDocuments: async () => fail() };
          },
        },
        {
          domain: "todo",
          async load() {
            return {
              revision: "todo-1",
              async loadDocuments() {
                healthyProjections += 1;
                return [document("first", "todo"), document("second", "todo")];
              },
            };
          },
        },
      ];
      const query = createSearchQuery({
        createCorpusKey: corpusKey,
        sourceProvider: {
          async listSources() {
            return { faults: [], sources };
          },
        },
      });
      const first = await query.search(
        { query: "needle", limit: 1 },
        undefined,
      );
      expect(first.results.map(({ resourceId }) => resourceId)).toEqual([
        "first",
      ]);
      expect(first.faults).toEqual([
        {
          code: "source_unavailable",
          domain: "journal",
          message: "Search source is unavailable",
        },
      ]);
      expect(first.cursor).not.toBeNull();
      const second = await query.search(
        {
          query: "needle",
          limit: 1,
          cursor: first.cursor!,
        },
        undefined,
      );
      expect(second.results.map(({ resourceId }) => resourceId)).toEqual([
        "second",
      ]);
      expect(second.faults).toEqual(first.faults);
      expect(second.cursor).toBeNull();
      expect(healthyProjections).toBe(1);
    },
  );

  it("invalidates partial-result cursors when a failed source recovers at the same revision", async () => {
    let available = false;
    const query = createSearchQuery({
      createCorpusKey: corpusKey,
      sourceProvider: {
        async listSources() {
          return {
            faults: [],
            sources: [
              {
                domain: "journal" as const,
                createFault: () => ({
                  code: "source_invalid" as const,
                  domain: "journal" as const,
                  message: "Journal projection is invalid",
                }),
                async load() {
                  return {
                    revision: "journal-1",
                    async loadDocuments() {
                      if (!available)
                        throw new Error("private projection failure");
                      return [document("recovered", "journal")];
                    },
                  };
                },
              },
              {
                domain: "todo" as const,
                async load() {
                  return {
                    revision: "todo-1",
                    async loadDocuments() {
                      return [
                        document("first", "todo"),
                        document("second", "todo"),
                      ];
                    },
                  };
                },
              },
            ],
          };
        },
      },
    });
    const partial = await query.search(
      { query: "needle", limit: 1 },
      undefined,
    );
    expect(partial.faults).toEqual([
      {
        code: "source_invalid",
        domain: "journal",
        message: "Journal projection is invalid",
      },
    ]);
    expect(partial.cursor).not.toBeNull();
    available = true;
    await expect(
      query.search(
        {
          query: "needle",
          limit: 1,
          cursor: partial.cursor!,
        },
        undefined,
      ),
    ).rejects.toMatchObject({ code: "cursor_conflict" });
    const complete = await query.search({ query: "needle" }, undefined);
    expect(complete.faults).toEqual([]);
    expect(complete.results.map(({ resourceId }) => resourceId)).toEqual([
      "recovered",
      "first",
      "second",
    ]);
  });
});
