import { useMemo } from "react";
import type { CtnSyntaxProfile } from "../../../../ctn/syntax/types";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import type { WorkspaceNote } from "../../../workspace/model/workspaceData";
import { parseWorkspaceSyntax } from "../../../workspace/context/workspaceSyntax";
import { listWorkspaceNotes } from "../../../workspace/queries/workspaceQueries";
import type { SessionCommands } from "../session/sessionCommands";
import type { ActiveSession } from "../session/useSession";
import { useWorkspaceSelection } from "../selection/useWorkspaceSelection";
import { useWorkspaceNavigation } from "../navigation/useWorkspaceNavigation";
import { useSyntaxRuntime } from "./useSyntaxRuntime";
import { useWorkspaceParseIndexCache } from "./useWorkspaceParseIndex";
import { useWorkbenchDiagnostics } from "../diagnostics/useWorkbenchDiagnostics";
import type { WorkspaceAnalysis } from "../analysis/workspaceAnalysis";
import { useWorkspaceAnalysis } from "../analysis/useWorkspaceAnalysis";
import { createUiWorkspacePortableNameDiagnostics } from "../projection/viewDiagnostics";

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
) {
  const {
    activateSyntaxFile,
    commands,
    createSyntaxFile,
    deleteSyntaxFile,
    defaultWorkspaceSyntax,
    persistence,
    syntaxCatalog,
    updateSyntaxFileSource,
    workspace,
    workspaceSyntax,
    context,
  } = session;
  const selection = useWorkspaceSelection({ commands, workspace });
  const syntaxFiles = useMemo(
    () => syntaxCatalog.files.map((file) => ({
      ...file,
      name: parseWorkspaceSyntax(file.source).profile.name,
    })),
    [syntaxCatalog.files],
  );
  const syntax = useSyntaxRuntime({
    activeFileId: syntaxCatalog.activeFileId,
    activateSyntaxFile,
    activeSyntaxProfile: workspaceSyntax?.profile ?? null,
    createSyntaxFile,
    deleteSyntaxFile,
    files: syntaxFiles,
    fallbackSyntaxProfile: defaultWorkspaceSyntax.profile,
    updateSyntaxFileSource,
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
  const portableNameDiagnostics = useMemo(
    () => createUiWorkspacePortableNameDiagnostics(workspace),
    [workspace],
  );
  const diagnostics = useWorkbenchDiagnostics({
    activeSyntaxFileId:
      syntax.selectedFileId === syntax.activeFileId
        ? syntax.activeFileId
        : null,
    analysis,
    isSyntaxConfigured: syntax.isConfigured,
    portableNameDiagnostics,
    syntaxDraft: syntax.syntaxDraft,
    syntaxDraftResult: syntax.syntaxDraftResult,
    syntaxCatalogNameConflictMessage: syntax.catalogNameConflictMessage,
  });
  const shell: WorkspaceShell = {
    errorMessage:
      persistence.status === "error" ? persistence.message : "",
    hasConfiguredSyntax: Boolean(workspaceSyntax && syntax.effectiveContext),
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
    selection,
    shell,
    syntax,
  };
}

export type WorkspaceApplication = ReturnType<typeof useWorkspaceApplication>;
