// SPDX-License-Identifier: GPL-3.0-or-later

import {
  AgentSessionTools,
  JournalAgentSessionTools,
  TodoAgentSessionTools,
  WorkspaceAgentSessionTools,
} from "../../../application/agentHost/index.ts";



import type {
  SearchQuery,
  SearchAccess,
} from "../../../application/search/index.ts";

import {
  digestAgentProposal,
  agentToolDecoder,
} from "../agent/index.ts";

import type {
  ApiBuiltInCatalog,
  WorkspaceRepositoryCatalog,
} from "../repository/index.ts";
import type { ApiRuntime } from "../api/http/index.ts";
import {
  projectApiJournalEntries,
  projectApiJournalEntry,
  projectApiTodoCollection,
  projectApiTodoCollections,
  projectApiWorkspaceAnalysis,
  projectApiWorkspaceNote,
  projectApiWorkspaceTree,
  journalResourceVersions,
  todoResourceVersions,
  workspaceResourceVersions,
} from "../api/resources/index.ts";





export function createServerAgentTools({ builtInCatalog, catalog, runtime, search }: {
  builtInCatalog: ApiBuiltInCatalog;
  catalog: WorkspaceRepositoryCatalog;
  runtime: ApiRuntime;
  search: SearchQuery<SearchAccess>;
}) {
  return new AgentSessionTools({
    decoder: agentToolDecoder,
    runtime,
    search,
    journal: new JournalAgentSessionTools({
      load: () => builtInCatalog.getStore("journal").then(store => store.loadSnapshot()),
      runtime,
      digest: digestAgentProposal,
      versions: journalResourceVersions,
      resources: {
        list: snapshot => projectApiJournalEntries(snapshot.content, snapshot.projection, snapshot.revision),
        read: parsed => {
          const { writingGuide: _writingGuide, ...resource } = projectApiJournalEntry(parsed);
          return resource;
        },
      },
    }),
    todo: new TodoAgentSessionTools({
      load: () => builtInCatalog.getStore("todo").then(store => store.loadSnapshot()),
      runtime,
      digest: digestAgentProposal,
      versions: todoResourceVersions,
      resources: {
        list: snapshot => projectApiTodoCollections(snapshot.content, snapshot.projection, snapshot.revision),
        read: (parsed, today) => {
          const collection = projectApiTodoCollection(parsed, today);
          const { writingGuide: _writingGuide, ...document } = collection.document;
          return { ...collection, document };
        },
      },
    }),
    workspace: new WorkspaceAgentSessionTools({
      load: id => catalog.getStore(id).then(store => store.loadSnapshot()),
      listRepositories: () => catalog.listRepositories(),
      runtime,
      digest: digestAgentProposal,
      versions: workspaceResourceVersions,
      resources: {
        tree: (id, snapshot) => projectApiWorkspaceTree(id, snapshot.revision, projectApiWorkspaceAnalysis(snapshot.projection)),
        note: (snapshot, id) => {
          const note = projectApiWorkspaceNote(projectApiWorkspaceAnalysis(snapshot.projection), id);
          if (!note) return null;
          const { writingGuide: _writingGuide, ...resource } = note;
          return resource;
        },
      },
    }),
  });
}
