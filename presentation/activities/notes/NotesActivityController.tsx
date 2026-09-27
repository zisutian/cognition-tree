// SPDX-License-Identifier: GPL-3.0-or-later

import { useLayoutEffect } from "react";
import {
  usePageDriver,
  usePageNavigation,
  describePage,
} from "../../navigation/index.ts";

import type { RepositoryApplication } from "../../../application/repository/index.ts";
import type {
  WorkbenchWorkspaceState,
  WorkspaceApplication,
} from "../../workspace/index.ts";
import {
  createNotesActivitySlots,
  createNotesWorkspaceActivitySlots,
  type NotesMode,
} from "./edit/NotesActivitySlots.tsx";
import { useNotesActivity } from "./edit/useNotesActivity.ts";
import {
  useReferenceGraphSession,
  type ReferenceGraphSession,
} from "./graph/useReferenceGraphSession.ts";
import { useVisualizationActivity } from "./graph/useVisualizationActivity.ts";
import { useVisualizationFilter } from "./graph/useVisualizationFilter.ts";
import { createVisualizationActivitySlots } from "./graph/VisualizationActivitySlots.tsx";
import { createStructureOperationActivitySlots } from "./structure/StructureOperationActivitySlots.tsx";
import { useStructureOperationActivity } from "./structure/useStructureOperationActivity.ts";
import { useStructureOperationState } from "./structure/useStructureOperationState.ts";

import type { ActivityControllerProps } from "../../ui/index.ts";
import {
  createRepositorySessionKey,
  useRepositorySessionState,
} from "../../ui/index.ts";
import { renderWorkspaceUnavailableActivity } from "../unavailable/index.ts";

const notesModeSessionKey = createRepositorySessionKey<NotesMode>("notes-mode");

function ActiveNotesActivity({
  application,
  active,
  mode,
  onModeChange,
  repositoryId,
  repositoryName,
  renderActivity,
  visualizationSession,
}: {
  application: WorkspaceApplication;
  active: boolean;
  mode: NotesMode;
  onModeChange(mode: NotesMode): void;
  repositoryId: string;
  repositoryName: string;
  renderActivity: ActivityControllerProps<NotesActivityApplication>["renderActivity"];
  visualizationSession: ReferenceGraphSession;
}) {
  const view = useNotesActivity({
    navigation: application.navigation,
    runtime: application.runtime,
    selection: application.selection,
  });
  const structureState = useStructureOperationState({
    activeNoteId: application.selection.activeNoteId,
    notes: application.runtime.effectiveNotes,
    workspace: application.runtime.effectiveWorkspace,
  });
  const structure = useStructureOperationActivity({
    repositoryId,
    runtime: application.runtime,
    selection: application.selection,
    state: structureState,
  });
  const visualizationFilter = useVisualizationFilter(repositoryId);
  const visualization = useVisualizationActivity({
    filter: visualizationFilter,
    runtime: application.runtime,
    selection: application.selection,
  });
  const pages = usePageNavigation();
  useLayoutEffect(() => {
    if (application.navigation.noteFocusRequest) onModeChange("edit");
  }, [application.navigation.noteFocusRequest?.requestId]);
  const notePage = (id: string) => {
    const note = application.runtime.effectiveNotes.find(
      (item) => item.id === id,
    );
    return note
      ? describePage("notes", "note", id, note.title, repositoryId)
      : null;
  };
  const toolPage = (kind: "structure" | "graph") =>
    describePage(
      "notes",
      kind,
      kind,
      kind === "graph" ? "引用图谱" : "结构操作",
      repositoryId,
    );
  usePageDriver("notes", {
    // Selection reconciliation owns the initial note; restore only after it has settled.
    ready:
      application.selection.activeNoteId !== null ||
      application.runtime.effectiveNotes.length === 0,
    current: () =>
      mode === "edit"
        ? view.activeNote
          ? notePage(view.activeNote.id)
          : describePage("notes", "activity", "notes", "笔记", repositoryId)
        : toolPage(mode),
    describe: (target) =>
      target.kind === "note"
        ? notePage(target.id)
        : target.kind === "graph" || target.kind === "structure"
          ? toolPage(target.kind)
          : describePage("notes", "activity", "notes", "笔记", repositoryId),
    select: (target) => {
      if (target.kind === "note") {
        if (!notePage(target.id)) return false;
        application.selection.selectNote(target.id);
        onModeChange("edit");
      } else if (target.kind === "graph" || target.kind === "structure")
        onModeChange(target.kind);
    },
  });
  if (!active) return null;
  return renderActivity((controls) =>
    createNotesWorkspaceActivitySlots({
      edit: createNotesActivitySlots({
        focusMode: controls.focusMode,
        onReload: application.reload,
        onToggleFocusMode: controls.onToggleFocusMode,
        repositoryId,
        repositoryName,
        view,
      }),
      graph: createVisualizationActivitySlots({
        onConfigureSyntax: controls.onConfigureSyntax,
        session: visualizationSession,
        shell: application.shell,
        view: visualization,
      }),
      mode,
      onModeChange: (next, intent = "preview") => {
        const page =
          next === "edit"
            ? view.activeNote
              ? notePage(view.activeNote.id)
              : describePage("notes", "activity", "notes", "笔记", repositoryId)
            : toolPage(next);
        if (page) pages.open(page, intent, () => onModeChange(next));
      },
      repositoryName,
      structure: createStructureOperationActivitySlots({
        onConfigureSyntax: controls.onConfigureSyntax,
        shell: application.shell,
        view: structure,
      }),
    }),
  );
}

export function NotesActivityController({
  active,
  application,
  onActiveActivityChange,
  renderActivity,
}: NotesActivityControllerProps) {
  const repositoryId =
    application.repository.activeDescriptor?.id ?? "workspace-unavailable";
  const [mode, setMode] = useRepositorySessionState<NotesMode>(
    notesModeSessionKey,
    repositoryId,
    () => "edit",
  );
  const visualizationSession = useReferenceGraphSession(repositoryId);

  if (application.workspace.status !== "ready") {
    if (!active) return null;
    return renderWorkspaceUnavailableActivity({
      onOpenRepository: () => onActiveActivityChange("repository"),
      renderActivity,
      workspace: application.workspace,
    });
  }

  return (
    <ActiveNotesActivity
      active={active}
      application={application.workspace.application}
      mode={mode}
      onModeChange={setMode}
      repositoryId={repositoryId}
      repositoryName={
        application.repository.activeDescriptor?.label ??
        (application.repository.session.status === "absent"
          ? "笔记"
          : application.repository.session.storageLabel)
      }
      renderActivity={renderActivity}
      visualizationSession={visualizationSession}
    />
  );
}

export type NotesActivityApplication = {
  repository: Pick<RepositoryApplication, "activeDescriptor" | "session">;
  workspace: WorkbenchWorkspaceState;
};
export type NotesActivityControllerProps =
  ActivityControllerProps<NotesActivityApplication>;
