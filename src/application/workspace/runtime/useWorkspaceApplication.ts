import { useMemo } from "react";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";
import type { WorkspaceParseIndexCache } from "../../../workspace/indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import type { NoteRecord } from "../../../workspace/model/workspaceData";
import { listWorkspaceNotes } from "../../../workspace/queries/workspaceQueries";
import type { SessionCommands } from "../session/sessionCommands";
import type { ActiveSession } from "../session/useSession";
import type { WorkspaceContext } from "../../../workspace/context/workspaceContext";
import { useWorkspaceSelection } from "../selection/useWorkspaceSelection";
import { useSyntaxRuntime } from "./useSyntaxRuntime";
import { useWorkspaceParseIndexCache } from "./useWorkspaceParseIndex";

export type WorkspaceShell = {
  errorMessage: string;
  hasConfiguredSyntax: boolean;
  useDefaultSyntax: () => void;
};

export type WorkspaceRuntime = {
  commands: SessionCommands;
  defaultSyntaxProfile: CtnSyntaxProfile;
  effectiveContext: WorkspaceContext | null;
  effectiveNotes: NoteRecord[];
  effectiveWorkspace: WorkspaceStructureIndex | null;
  parseIndexCache: WorkspaceParseIndexCache;
  workspace: WorkspaceStructureIndex;
};

export function useWorkspaceApplication(session: ActiveSession) {
  const {
    commands,
    defaultWorkspaceSyntaxFile,
    errorMessage,
    updateWorkspaceSyntaxSource,
    useDefaultWorkspaceSyntaxFile,
    workspace,
    workspaceSyntaxFile,
    context,
  } = session;
  const selection = useWorkspaceSelection({ commands, workspace });
  const syntax = useSyntaxRuntime({
    syntaxProfile:
      workspaceSyntaxFile?.profile ?? defaultWorkspaceSyntaxFile.profile,
    syntaxSource:
      workspaceSyntaxFile?.source ?? defaultWorkspaceSyntaxFile.source,
    updateWorkspaceSyntaxSource,
    workspace: context?.workspace ?? null,
  });
  const effectiveWorkspace = syntax.effectiveContext?.workspace ?? null;
  const effectiveNotes = useMemo(
    () => effectiveWorkspace ? listWorkspaceNotes(effectiveWorkspace) : [],
    [effectiveWorkspace],
  );
  const parseIndexCache = useWorkspaceParseIndexCache();
  const shell: WorkspaceShell = {
    errorMessage,
    hasConfiguredSyntax: Boolean(workspaceSyntaxFile && syntax.effectiveContext),
    useDefaultSyntax: () => {
      void useDefaultWorkspaceSyntaxFile();
    },
  };
  const repository = {
    discardPendingChangesAndReload: session.discardPendingChangesAndReload,
    reload: session.reload,
    repositoryPath: session.repositoryPath,
    saveStatus: session.saveStatus,
    status: session.status,
    storageLabel: session.storageLabel,
  };
  const runtime: WorkspaceRuntime = {
    commands,
    defaultSyntaxProfile: defaultWorkspaceSyntaxFile.profile,
    effectiveContext: syntax.effectiveContext,
    effectiveNotes,
    effectiveWorkspace,
    parseIndexCache,
    workspace,
  };

  return {
    runtime,
    repository,
    selection,
    shell,
    syntax,
  };
}

export type WorkspaceApplication = ReturnType<typeof useWorkspaceApplication>;
