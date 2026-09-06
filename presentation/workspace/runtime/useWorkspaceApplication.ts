// SPDX-License-Identifier: GPL-3.0-or-later

import { useMemo } from "react";
import type {
  WorkspaceStructureIndex,
  WorkspaceNote,
} from "../../../core/workspace/index.ts";

import { listWorkspaceNotes } from "../../../core/workspace/index.ts";
import type {
  SessionCommands,
  ActiveWorkspaceSession,
  WorkspaceAnalysis,
} from "../../../application/workspace/index.ts";

import { useWorkspaceSelection } from "../selection/useWorkspaceSelection.ts";
import { useWorkspaceNavigation } from "../navigation/useWorkspaceNavigation.ts";
import { useSyntaxRuntime } from "./useSyntaxRuntime.ts";
import { useWorkbenchDiagnostics } from "../diagnostics/useWorkbenchDiagnostics.ts";

import { useWorkspaceAnalysis } from "../analysis/useWorkspaceAnalysis.ts";
import { createUiWorkspacePortableNameDiagnostics } from "../../../application/workspace/index.ts";

export type WorkspaceShell = {
  hasConfiguredSyntax: boolean;
};

export type WorkspaceRuntime = {
  analysis: WorkspaceAnalysis;
  commands: SessionCommands;
  effectiveNotes: WorkspaceNote[];
  effectiveWorkspace: WorkspaceStructureIndex | null;
  readOnly: boolean;
  workspace: WorkspaceStructureIndex;
};

export function useWorkspaceApplication(
  session: ActiveWorkspaceSession,
  scheduler: import("../../../application/runtime/index.ts").ApplicationScheduler,
) {
  const {
    activateSyntaxFile,
    commands,
    createSyntaxFile,
    deleteSyntaxFile,
    syntaxCatalog,
    updateSyntaxFileSource,
    workspace,
    workspaceSyntax,
    context,
  } = session;
  const selection = useWorkspaceSelection({ commands, workspace });
  const syntax = useSyntaxRuntime({
    activeFileId: syntaxCatalog.activeFileId,
    activateSyntaxFile,
    activeSyntax: workspaceSyntax?.syntax ?? null,
    createSyntaxFile,
    deleteSyntaxFile,
    files: syntaxCatalog.files,
    updateSyntaxFileSource,
    workspace: context?.workspace ?? null,
  });
  const effectiveWorkspace = syntax.effectiveContext?.workspace ?? null;
  const effectiveNotes = useMemo(
    () => effectiveWorkspace ? listWorkspaceNotes(effectiveWorkspace) : [],
    [effectiveWorkspace],
  );
  const analysis = useWorkspaceAnalysis({
    scheduler,
    enabled: syntax.isConfigured,
    index: syntax.isConfigured ? session.analysisIndex : null,
  });
  const navigation = useWorkspaceNavigation({
    analysisIndex: session.analysisIndex,
    selection,
    workspace,
  });
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
    effectiveNotes,
    effectiveWorkspace,
    readOnly: !session.canMutate(),
    workspace,
  };

  return {
    diagnostics,
    navigation,
    reload: session.reload,
    runtime,
    selection,
    shell,
    syntax,
  };
}

export type WorkspaceApplication = ReturnType<typeof useWorkspaceApplication>;
