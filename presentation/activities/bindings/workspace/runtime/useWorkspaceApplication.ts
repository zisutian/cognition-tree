import { useMemo } from "react";
import type { CtnSyntaxProfile } from "../../../../../core/ctn/syntax/types";
import type { WorkspaceStructureIndex } from "../../../../../core/workspace/indexes/workspaceStructureIndex";
import type { WorkspaceNote } from "../../../../../core/workspace/model/workspaceData";
import { parseWorkspaceSyntax } from "../../../../../core/workspace/context/workspaceSyntax";
import { listWorkspaceNotes } from "../../../../../core/workspace/queries/workspaceQueries";
import type { SessionCommands } from "../../../../../application/workspace/session/sessionCommands";
import type { ActiveWorkspaceSession } from "../../../../../application/workspace/session/workspaceSessionApplication";
import { useWorkspaceSelection } from "../selection/useWorkspaceSelection";
import { useWorkspaceNavigation } from "../navigation/useWorkspaceNavigation";
import { useSyntaxRuntime } from "./useSyntaxRuntime";
import { useWorkspaceParseIndexCache } from "./useWorkspaceParseIndex";
import { useWorkbenchDiagnostics } from "../diagnostics/useWorkbenchDiagnostics";
import type { WorkspaceAnalysis } from "../../../../../application/workspace/analysis/workspaceAnalysis";
import { useWorkspaceAnalysis } from "../analysis/useWorkspaceAnalysis";
import { createUiWorkspacePortableNameDiagnostics } from "../../../../../application/workspace/projection/viewDiagnostics";

export type WorkspaceShell = {
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
  session: ActiveWorkspaceSession,
) {
  const {
    activateSyntaxFile,
    commands,
    createSyntaxFile,
    deleteSyntaxFile,
    defaultWorkspaceSyntax,
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
