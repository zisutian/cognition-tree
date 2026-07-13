import { useMemo } from "react";
import type { CtnSyntaxProfile } from "../../../ctn/syntax/types";
import type { WorkspaceParseIndexCache } from "../../../workspace/indexes/workspaceParseIndex";
import type { WorkspaceStructureIndex } from "../../../workspace/indexes/workspaceStructureIndex";
import type { NoteRecord } from "../../../workspace/model/workspaceData";
import { listWorkspaceNotes } from "../../../workspace/queries/workspaceQueries";
import type {
  ActiveSession,
  WorkspaceSessionSaveStatus,
} from "../session/useSession";
import type { SessionCommands } from "../session/sessionCommands";
import type { WorkspaceContext } from "../../../workspace/context/workspaceContext";
import { useWorkspaceSelection } from "../selection/useWorkspaceSelection";
import { useSyntaxRuntime } from "./useSyntaxRuntime";
import { useWorkspaceParseIndexCache } from "./useWorkspaceParseIndex";

const saveStatusLabels: Record<WorkspaceSessionSaveStatus, string> = {
  error: "保存失败",
  idle: "等待保存",
  pending: "等待保存",
  saved: "已保存",
  saving: "保存中",
};

export type WorkspaceShell = {
  errorMessage: string;
  hasConfiguredSyntax: boolean;
  useDefaultSyntax: () => void;
};

export type WorkspaceSettings = {
  discardPendingChangesAndReload: () => Promise<void>;
  hasSaveConflict: boolean;
  reload: () => Promise<void>;
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
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
) {
  const {
    commands,
    defaultWorkspaceSyntaxFile,
    discardPendingChangesAndReload,
    errorMessage,
    reload,
    repositoryPath,
    saveStatus,
    storageLabel,
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
  const hasSaveConflict = session.status === "conflict";
  const shell: WorkspaceShell = {
    errorMessage,
    hasConfiguredSyntax: Boolean(workspaceSyntaxFile && syntax.effectiveContext),
    useDefaultSyntax: () => {
      void useDefaultWorkspaceSyntaxFile();
    },
  };
  const settings: WorkspaceSettings = {
    discardPendingChangesAndReload,
    hasSaveConflict,
    reload,
    repositoryPath,
    saveStatusLabel: hasSaveConflict
      ? "磁盘内容已更改"
      : saveStatusLabels[saveStatus],
    storageLabel,
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
    selection,
    settings,
    shell,
    syntax,
  };
}

export type WorkspaceApplication = ReturnType<typeof useWorkspaceApplication>;
