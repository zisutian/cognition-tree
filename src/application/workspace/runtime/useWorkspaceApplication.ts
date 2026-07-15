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
import { useWorkspaceNavigation } from "../navigation/useWorkspaceNavigation";
import { useSyntaxRuntime } from "./useSyntaxRuntime";
import { useWorkspaceParseIndexCache } from "./useWorkspaceParseIndex";
import type { WorkspaceRepositoryDescriptor } from "../../../storage/repository/workspaceRepositoryCatalog";
import { useWorkbenchDiagnostics } from "../diagnostics/useWorkbenchDiagnostics";

export type WorkspaceRepositoryManagement = {
  activeRepositoryId: string;
  createRepository: (input: { id: string; name: string }) => Promise<void>;
  repositories: WorkspaceRepositoryDescriptor[];
  selectRepository: (repositoryId: string) => Promise<void>;
};

export type WorkspaceShell = {
  errorMessage: string;
  hasConfiguredSyntax: boolean;
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

export function useWorkspaceApplication(
  session: ActiveSession,
  repositoryManagement: WorkspaceRepositoryManagement,
) {
  const {
    commands,
    defaultWorkspaceSyntax,
    errorMessage,
    updateWorkspaceSyntaxSource,
    useDefaultWorkspaceSyntax,
    workspace,
    workspaceSyntax,
    context,
  } = session;
  const selection = useWorkspaceSelection({ commands, workspace });
  const syntax = useSyntaxRuntime({
    syntaxProfile:
      workspaceSyntax?.profile ?? defaultWorkspaceSyntax.profile,
    syntaxSource:
      workspaceSyntax?.source ?? defaultWorkspaceSyntax.source,
    createDefaultSyntax: useDefaultWorkspaceSyntax,
    isConfigured: Boolean(workspaceSyntax),
    updateWorkspaceSyntaxSource,
    workspace: context?.workspace ?? null,
  });
  const effectiveWorkspace = syntax.effectiveContext?.workspace ?? null;
  const effectiveNotes = useMemo(
    () => effectiveWorkspace ? listWorkspaceNotes(effectiveWorkspace) : [],
    [effectiveWorkspace],
  );
  const parseIndexCache = useWorkspaceParseIndexCache();
  const navigation = useWorkspaceNavigation({ selection, workspace });
  const diagnostics = useWorkbenchDiagnostics({
    effectiveContext: syntax.effectiveContext,
    isSyntaxConfigured: syntax.isConfigured,
    parseIndexCache,
    syntaxDraft: syntax.syntaxDraft,
    syntaxDraftResult: syntax.syntaxDraftResult,
  });
  const shell: WorkspaceShell = {
    errorMessage,
    hasConfiguredSyntax: Boolean(workspaceSyntax && syntax.effectiveContext),
  };
  const repository = {
    ...repositoryManagement,
    availability: session.availability,
    discardPendingChangesAndReload: session.discardPendingChangesAndReload,
    reload: session.reload,
    repositoryPath: session.repositoryPath,
    saveStatus: session.saveStatus,
    status: session.status,
    storageLabel: session.storageLabel,
  };
  const runtime: WorkspaceRuntime = {
    commands,
    defaultSyntaxProfile: defaultWorkspaceSyntax.profile,
    effectiveContext: syntax.effectiveContext,
    effectiveNotes,
    effectiveWorkspace,
    parseIndexCache,
    workspace,
  };

  return {
    diagnostics,
    navigation,
    runtime,
    repository,
    selection,
    shell,
    syntax,
  };
}

export type WorkspaceApplication = ReturnType<typeof useWorkspaceApplication>;
