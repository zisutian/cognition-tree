import { useMemo } from "react";
import type { CtnSyntaxProfile } from "../../../../ctn/syntax/types";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import type { WorkspaceNote } from "../../../workspace/model/workspaceData";
import { listWorkspaceNotes } from "../../../workspace/queries/workspaceQueries";
import type { SessionCommands } from "../session/sessionCommands";
import type { ActiveSession } from "../session/useSession";
import { useWorkspaceSelection } from "../selection/useWorkspaceSelection";
import { useWorkspaceNavigation } from "../navigation/useWorkspaceNavigation";
import { useSyntaxRuntime } from "./useSyntaxRuntime";
import { useWorkspaceParseIndexCache } from "./useWorkspaceParseIndex";
import type {
  RepositoryAdapterKind,
  WorkspaceRepositoryCatalogIssue,
  WorkspaceRepositoryDescriptor,
} from "../../../storage/repository/workspaceRepositoryCatalog";
import { useWorkbenchDiagnostics } from "../diagnostics/useWorkbenchDiagnostics";
import type { WorkspaceAnalysis } from "../analysis/workspaceAnalysis";
import { useWorkspaceAnalysis } from "../analysis/useWorkspaceAnalysis";
import type {
  CreateRepositoryRequest,
  DeleteRepositoryRequest,
  RepositoryCatalogOperation,
} from "../session/useRepositoryCatalog";

export type WorkspaceRepositoryManagement = {
  activeRepositoryId: string;
  creatableAdapters: RepositoryAdapterKind[];
  createRepository: (input: CreateRepositoryRequest) => Promise<void>;
  deleteRepository: (input: DeleteRepositoryRequest) => Promise<void>;
  issues: WorkspaceRepositoryCatalogIssue[];
  operation: RepositoryCatalogOperation;
  repositories: WorkspaceRepositoryDescriptor[];
  selectRepository: (repositoryId: string) => Promise<void>;
};

export type WorkspaceShell = {
  errorMessage: string;
  hasConfiguredSyntax: boolean;
};

export type WorkspaceRuntime = {
  analysis: WorkspaceAnalysis;
  commands: SessionCommands;
  defaultSyntaxProfile: CtnSyntaxProfile;
  effectiveNotes: WorkspaceNote[];
  effectiveWorkspace: WorkspaceStructureIndex | null;
  workspace: WorkspaceStructureIndex;
};

export function useWorkspaceApplication(
  session: ActiveSession,
  repositoryManagement: WorkspaceRepositoryManagement,
) {
  const {
    commands,
    defaultWorkspaceSyntax,
    persistence,
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
  const analysis = useWorkspaceAnalysis({
    context: syntax.effectiveContext,
    enabled: syntax.isConfigured,
    indexCache: parseIndexCache,
  });
  const navigation = useWorkspaceNavigation({ selection, workspace });
  const diagnostics = useWorkbenchDiagnostics({
    analysis,
    isSyntaxConfigured: syntax.isConfigured,
    syntaxDraft: syntax.syntaxDraft,
    syntaxDraftResult: syntax.syntaxDraftResult,
  });
  const shell: WorkspaceShell = {
    errorMessage:
      persistence.status === "error" ? persistence.message : "",
    hasConfiguredSyntax: Boolean(workspaceSyntax && syntax.effectiveContext),
  };
  const repository = {
    ...repositoryManagement,
    discardPendingChangesAndReload: session.discardPendingChangesAndReload,
    location: session.location,
    persistence,
    reload: session.reload,
    storageLabel: session.storageLabel,
  };
  const runtime: WorkspaceRuntime = {
    analysis,
    commands,
    defaultSyntaxProfile: defaultWorkspaceSyntax.profile,
    effectiveNotes,
    effectiveWorkspace,
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
