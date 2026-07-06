import {
  Braces,
  Database,
  FileText,
  MoveRight,
  Network,
  Search,
  Settings,
} from "lucide-react";
import type { ViewModel } from "../../application/workspace/view-model/useViewModel";
import type {
  ActivityId,
  ActivityItem,
  ActivitySlots,
} from "../activityTypes";
import {
  ActivityMainPlaceholder,
  ActivitySidebarPlaceholder,
} from "./ActivityPlaceholderPanels";
import { MigrationMainPanel } from "./migration/MigrationMainPanel";
import { MigrationSidebarPanel } from "./migration/MigrationSidebarPanel";
import { NoteEditorPanel } from "./notes/NoteEditorPanel";
import { NoteOutlinePanel } from "./notes/NoteOutlinePanel";
import { NotesSidebarPanel } from "./notes/NotesSidebarPanel";
import { SettingsSidebarPanel } from "./settings/SettingsSidebarPanel";
import { SyntaxProfileDetailPanel } from "./syntax/SyntaxProfileDetailPanel";
import { SyntaxSetupPanel } from "./syntax/SyntaxSetupPanel";
import { SyntaxMainPanel } from "./syntax/SyntaxMainPanel";
import { NoteReferenceGraphDetailPanel } from "./visualization/NoteReferenceGraphDetailPanel";
import { NoteReferenceGraphPanel } from "./visualization/NoteReferenceGraphPanel";

export const activityItems: ActivityItem[] = [
  { id: "notes", label: "笔记", icon: FileText },
  { id: "migration", label: "块迁移", icon: MoveRight },
  { id: "visualization", label: "可视化", icon: Network },
  { id: "syntax", label: "语法", icon: Braces },
  { id: "search", label: "搜索", icon: Search },
  { id: "data", label: "数据", icon: Database },
  { id: "settings", label: "设置", icon: Settings },
];

const placeholderEntries: Record<"search" | "data", string[]> = {
  data: ["文件库", "索引", "导入导出"],
  search: ["标题", "正文", "块类型"],
};

type ActivityContext = {
  activityId: ActivityId;
  view: ViewModel;
  onConfigureSyntax: () => void;
};

function createSyntaxSetupMain({
  view,
  onConfigureSyntax,
}: Pick<ActivityContext, "view" | "onConfigureSyntax">) {
  return (
    <SyntaxSetupPanel
      errorMessage={view.errorMessage}
      onConfigureSyntax={onConfigureSyntax}
      onUseDefaultSyntax={view.useDefaultSyntax}
    />
  );
}

function createNotesSlots({
  view,
  onConfigureSyntax,
}: Pick<ActivityContext, "view" | "onConfigureSyntax">): ActivitySlots {
  const sidebar = (
    <NotesSidebarPanel
      view={view.sidebar}
      onCreateFolder={view.createFolder}
      onCreateNote={view.createNote}
      onDeleteFolder={view.deleteFolder}
      onDeleteNote={view.deleteNote}
      onMoveNote={view.moveNote}
      onMoveTreeNode={view.moveSidebarTreeNode}
      onRenameFolder={view.renameFolder}
      onRenameNote={view.renameNote}
      onSelectFolder={view.selectFolder}
      onSelectNote={view.selectNote}
    />
  );

  if (!view.hasConfiguredSyntax || !view.editor.hasParsedDocument) {
    return {
      detail: null,
      main: createSyntaxSetupMain({ view, onConfigureSyntax }),
      sidebar,
    };
  }

  return {
    detail: (
      <NoteOutlinePanel
        nodes={view.outline.nodes}
        onSelectLine={view.outline.onSelectLine}
      />
    ),
    main: (
      <NoteEditorPanel
        currentNoteTitle={view.editor.currentNoteTitle}
        diagnostics={view.editor.diagnostics}
        focusTarget={view.editor.focusTarget}
        hasActiveNote={view.editor.hasActiveNote}
        lineCount={view.editor.stats.lineCount}
        rootCount={view.editor.stats.rootCount}
        syntaxProfile={view.editor.syntaxProfile}
        totalBlocks={view.editor.stats.totalBlocks}
        totalDiagnostics={view.editor.stats.diagnosticCount}
        value={view.editor.documentText}
        errorMessage={view.errorMessage}
        onCreateNote={view.createNote}
        onDocumentTextChange={view.updateActiveNoteSource}
      />
    ),
    sidebar,
  };
}

function createMigrationSlots({
  view,
  onConfigureSyntax,
}: Pick<ActivityContext, "view" | "onConfigureSyntax">): ActivitySlots {
  return {
    detail: null,
    main: view.hasConfiguredSyntax ? (
      <MigrationMainPanel view={view.migration} />
    ) : (
      createSyntaxSetupMain({ view, onConfigureSyntax })
    ),
    sidebar: <MigrationSidebarPanel />,
  };
}

function createVisualizationSlots({
  view,
  onConfigureSyntax,
}: Pick<ActivityContext, "view" | "onConfigureSyntax">): ActivitySlots {
  if (!view.hasConfiguredSyntax) {
    return {
      detail: null,
      main: createSyntaxSetupMain({ view, onConfigureSyntax }),
      sidebar: null,
    };
  }

  return {
    detail: <NoteReferenceGraphDetailPanel graph={view.visualization} />,
    main: <NoteReferenceGraphPanel graph={view.visualization} />,
    sidebar: null,
  };
}

function createSyntaxSlots({ view }: Pick<ActivityContext, "view">): ActivitySlots {
  return {
    detail: (
      <SyntaxProfileDetailPanel
        draftResult={view.syntax.draftResult}
        feedback={view.syntax.feedback}
      />
    ),
    main: <SyntaxMainPanel view={view.syntax} />,
    sidebar: null,
  };
}

function createSettingsSlots({ view }: Pick<ActivityContext, "view">): ActivitySlots {
  return {
    detail: null,
    main: (
      <ActivityMainPlaceholder
        description="仓库设置在侧栏中管理。"
        label="设置"
      />
    ),
    sidebar: (
      <SettingsSidebarPanel
        canChangeRepositoryPath={view.canChangeRepositoryPath}
        repositoryPath={view.sidebar.repositoryPath}
        saveStatusLabel={view.sidebar.saveStatusLabel}
        storageLabel={view.sidebar.storageLabel}
        onChangeRepositoryPath={view.changeRepositoryPath}
        onReload={view.reload}
      />
    ),
  };
}

function createPlaceholderSlots(
  activityId: "search" | "data",
): ActivitySlots {
  const item = activityItems.find((entry) => entry.id === activityId);
  const label = item?.label ?? "功能";
  const entries = placeholderEntries[activityId];

  return {
    detail: null,
    main: (
      <ActivityMainPlaceholder
        description={`${label}功能待接入。`}
        label={label}
      />
    ),
    sidebar: <ActivitySidebarPlaceholder entries={entries} label={label} />,
  };
}

export function createActivitySlots({
  activityId,
  view,
  onConfigureSyntax,
}: ActivityContext): ActivitySlots {
  switch (activityId) {
    case "notes":
      return createNotesSlots({ view, onConfigureSyntax });
    case "migration":
      return createMigrationSlots({ view, onConfigureSyntax });
    case "visualization":
      return createVisualizationSlots({ view, onConfigureSyntax });
    case "syntax":
      return createSyntaxSlots({ view });
    case "settings":
      return createSettingsSlots({ view });
    case "search":
    case "data":
      return createPlaceholderSlots(activityId);
  }
}
