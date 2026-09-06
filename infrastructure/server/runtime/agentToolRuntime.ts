// SPDX-License-Identifier: GPL-3.0-or-later

import { AgentSessionTools } from "../../../application/agentHost/sessionTools.ts";
import { JournalAgentSessionTools } from "../../../application/agentHost/journalSessionTools.ts";
import { TodoAgentSessionTools } from "../../../application/agentHost/todoSessionTools.ts";
import { WorkspaceAgentSessionTools } from "../../../application/agentHost/workspaceSessionTools.ts";
import type { SearchQuery } from "../../../application/search/searchTypes.ts";
import type { SearchAccess } from "../../../application/search/scopedSearch.ts";
import { digestAgentProposal } from "../agent/proposalCodec.ts";
import { agentToolDecoder } from "../agent/sessionToolProtocol.ts";
import type { ApiBuiltInCatalog } from "../api/http/ports.ts";
import type { ApiRuntime } from "../api/http/runtime.ts";
import { projectApiJournalEntries, projectApiJournalEntry } from "../api/resources/journal.ts";
import { projectApiTodoCollection, projectApiTodoCollections } from "../api/resources/todo.ts";
import { projectApiWorkspaceAnalysis, projectApiWorkspaceNote, projectApiWorkspaceTree } from "../api/resources/workspace.ts";
import { journalResourceVersions, todoResourceVersions, workspaceResourceVersions } from "../api/resources/versions.ts";
import type { WorkspaceRepositoryCatalog } from "../repository/catalog.ts";

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
