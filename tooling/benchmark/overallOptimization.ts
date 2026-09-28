// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { createTodoResourceVersions, createTodoDiagnostics } from "../../application/todo/index.ts";
import { createSearchQuery, type SearchDocument, type SearchSource } from "../../application/search/index.ts";
import { createTodoParseIndex, createEmptyTodoContent, type TodoCollection } from "../../core/todo/index.ts";

const sampleCount = 5;
const timestamp = "2026-01-01T00:00:00.000Z";
const collectionId = "todo-collection-00000000-0000-4000-8000-000000000001" as const;
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const digest = (value: unknown) =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}` as const;
const versions = createTodoResourceVersions(digest);

function summarize(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  return { samples: values, median: ordered[2], minimum: ordered[0], maximum: ordered[4] };
}

async function sample(action: () => void | Promise<void>) {
  await action(); // Warm the same code and snapshot before measuring.
  const values: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const start = performance.now();
    await action();
    values.push(Number((performance.now() - start).toFixed(3)));
  }
  return summarize(values);
}

function versionCollection(size: number, countReads?: { value: number }): TodoCollection {
  return {
    id: collectionId,
    source: "",
    completions: Array.from({ length: size }, (_, index) => {
      const value = id(index + 2);
      return countReads
        ? { get blockId() { countReads.value += 1; return value; }, completedAt: timestamp }
        : { blockId: value, completedAt: timestamp };
    }),
    recurrences: Array.from({ length: size }, (_, index) => {
      const value = id(index + 2);
      return countReads
        ? { get blockId() { countReads.value += 1; return value; }, completions: [], stages: [] }
        : { blockId: value, completions: [], stages: [] };
    }),
  };
}

function readVersions(collection: TodoCollection, size: number) {
  for (let index = 0; index < size; index += 1) {
    versions.itemState(collection, id(index + 2));
  }
}

function diagnosticIndex(size: number, countReads?: { value: number }) {
  const metadata = (index: number) =>
    `@ctn-block id=${id(index)} created=${timestamp} updated=${timestamp}`;
  const source = [metadata(1), "Bench", ...Array.from({ length: size }, (_, index) => [
    metadata(index + 2), `: invalid ${index}`,
  ]).flat()].join("\n");
  const index = createTodoParseIndex({
    schemaVersion: 4,
    syntaxSource: createEmptyTodoContent().syntaxSource,
    collections: [{ id: collectionId, source, completions: [], recurrences: [] }],
  });
  if (!countReads) return index;
  const parsed = index.collections[0]!;
  const blocks = parsed.analysis.document.blocks.map((block) => ({
    ...block,
    get diagnostics() { countReads.value += 1; return block.diagnostics; },
  }));
  return {
    ...index,
    collections: [{
      ...parsed,
      analysis: { ...parsed.analysis, document: { ...parsed.analysis.document, blocks } },
    }],
  };
}

async function searchProbe() {
  let active = 0;
  let maximumActive = 0;
  let sourceReads = 0;
  let documentReads = 0;
  const work = async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
  };
  const document: SearchDocument = {
    blocks: [], domain: "todo", editableText: "needle", resourceId: "one",
    title: "one", updatedAt: timestamp, version: `sha256:${"a".repeat(64)}`,
  };
  const sources: SearchSource[] = Array.from({ length: 80 }, (_, index) => ({
    domain: "workspace" as const,
    repositoryId: `repository-${index}`,
    async load() {
      sourceReads += 1;
      await work();
      return {
        revision: `revision-${index}`,
        async loadDocuments() {
          documentReads += 1;
          await work();
          return [{ ...document, domain: "workspace" as const, repositoryId: `repository-${index}` }];
        },
      };
    },
  }));
  const query = createSearchQuery({
    createCorpusKey: (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex"),
    maximumCachedSources: 0,
    sourceProvider: { async listSources() { return { faults: [], sources }; } },
  });
  const start = performance.now();
  await Promise.all([
    query.search({ query: "needle" }, undefined),
    query.search({ query: "one" }, undefined),
  ]);
  return {
    milliseconds: Number((performance.now() - start).toFixed(3)),
    maximumActive, sourceReads, documentReads,
  };
}

const versionResults = [];
for (const size of [1_000, 5_000, 10_000]) {
  const collection = versionCollection(size);
  const duration = await sample(() => readVersions(collection, size));
  const reads = { value: 0 };
  readVersions(versionCollection(size, reads), size);
  versionResults.push({ size, duration, blockIdReads: reads.value });
}
const diagnosticSize = 3_000;
const index = diagnosticIndex(diagnosticSize);
const diagnosticCount = index.collections[0]!.analysis.document.diagnostics.length;
const diagnosticsDuration = await sample(() => { createTodoDiagnostics(index); });
const diagnosticReads = { value: 0 };
createTodoDiagnostics(diagnosticIndex(diagnosticSize, diagnosticReads));
await searchProbe(); // Warm the source and document path.
const searchSamples = [];
for (let index = 0; index < sampleCount; index += 1) searchSamples.push(await searchProbe());

console.log(JSON.stringify({
  phase: process.argv[2] ?? "unlabeled",
  runtime: { node: process.version, cpu: cpus()[0]?.model ?? null, platform: process.platform },
  todoVersions: versionResults,
  todoDiagnostics: { size: diagnosticSize, diagnosticCount, duration: diagnosticsDuration, blockDiagnosticReads: diagnosticReads.value },
  search: {
    duration: summarize(searchSamples.map(({ milliseconds }) => milliseconds)),
    maximumActive: searchSamples.map(({ maximumActive }) => maximumActive),
    sourceReads: searchSamples.map(({ sourceReads }) => sourceReads),
    documentReads: searchSamples.map(({ documentReads }) => documentReads),
  },
}, null, 2));
