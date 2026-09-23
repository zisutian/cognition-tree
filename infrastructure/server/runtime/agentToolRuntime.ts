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
  readJournalEntriesResource,
  projectJournalEntryResource,
  readTodoCollectionsResource,
  projectTodoCollectionResource,
  readWorkspaceNoteResource,
  readWorkspaceTreeResource,
} from "../../../application/content/index.ts";
import {
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
        list: snapshot => readJournalEntriesResource(snapshot.content, snapshot.projection, snapshot.revision, journalResourceVersions),
        read: parsed => {
          const { writingGuide: _writingGuide, ...resource } = projectJournalEntryResource(parsed, journalResourceVersions);
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
        list: snapshot => readTodoCollectionsResource(snapshot.content, snapshot.projection, snapshot.revision, todoResourceVersions),
        read: (parsed, today) => {
          const collection = projectTodoCollectionResource(parsed, today, todoResourceVersions);
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
        tree: (id, snapshot) => readWorkspaceTreeResource(id, snapshot.revision, snapshot.content, snapshot.projection, workspaceResourceVersions),
        note: (snapshot, id) => {
          const note = readWorkspaceNoteResource(snapshot.projection, id, workspaceResourceVersions);
          if (!note) return null;
          const { writingGuide: _writingGuide, ...resource } = note;
          return resource;
        },
      },
    }),
  });
}
