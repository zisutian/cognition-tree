import type { ViewModel } from "../../application/workspace/view-model/useViewModel";
import type {
  ActivityId,
  ActivitySlots,
} from "../activityTypes";
import { MigrationContext, MigrationMainPanel } from "./migration/MigrationPanels";
import {
  NoteDetailPanel,
  NoteEditorPanel,
  NotesContext,
} from "./notes/NotesPanels";
import { PlaceholderPanel } from "./PlaceholderPanel";
import { SettingsPanel } from "./settings/SettingsPanel";
import {
  SyntaxDetailPanel,
  SyntaxMainPanel,
  SyntaxSetupPanel,
} from "./syntax/SyntaxPanels";
import {
  VisualizationDetailPanel,
  VisualizationPanel,
} from "./visualization/VisualizationPanels";

type ActivityContext = {
  activityId: ActivityId;
  onCollapseDetail: () => void;
  onConfigureSyntax: () => void;
  view: ViewModel;
};

function syntaxSetup({
  onConfigureSyntax,
  view,
}: Pick<ActivityContext, "onConfigureSyntax" | "view">) {
  return (
    <SyntaxSetupPanel
      errorMessage={view.errorMessage}
      onConfigureSyntax={onConfigureSyntax}
      onUseDefaultSyntax={view.useDefaultSyntax}
    />
  );
}

function notesSlots({
  onCollapseDetail,
  onConfigureSyntax,
  view,
}: Pick<ActivityContext, "onCollapseDetail" | "onConfigureSyntax" | "view">): ActivitySlots {
  return {
    context: {
      content: <NotesContext view={view} />,
      title: "笔记",
    },
    detail:
      view.hasConfiguredSyntax && view.editor.hasParsedDocument ? (
        <NoteDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
      ) : null,
    main:
      view.hasConfiguredSyntax && view.editor.hasParsedDocument ? (
        <NoteEditorPanel view={view} />
      ) : (
        syntaxSetup({ onConfigureSyntax, view })
      ),
    mainSpan: "standard",
  };
}

function migrationSlots({
  onConfigureSyntax,
  view,
}: Pick<ActivityContext, "onConfigureSyntax" | "view">): ActivitySlots {
  return {
    context: {
      content: <MigrationContext view={view} />,
      title: "结构操作",
    },
    detail: null,
    main: view.hasConfiguredSyntax ? (
      <MigrationMainPanel view={view} />
    ) : (
      syntaxSetup({ onConfigureSyntax, view })
    ),
    mainSpan: "full",
  };
}

function syntaxSlots({
  onCollapseDetail,
  view,
}: Pick<ActivityContext, "onCollapseDetail" | "view">): ActivitySlots {
  return {
    context: null,
    detail: <SyntaxDetailPanel onCollapseDetail={onCollapseDetail} view={view} />,
    main: <SyntaxMainPanel view={view} />,
    mainSpan: "standard",
  };
}

function visualizationSlots({
  onCollapseDetail,
  onConfigureSyntax,
  view,
}: Pick<ActivityContext, "onCollapseDetail" | "onConfigureSyntax" | "view">): ActivitySlots {
  if (!view.hasConfiguredSyntax) {
    return {
      context: null,
      detail: null,
      main: syntaxSetup({ onConfigureSyntax, view }),
      mainSpan: "standard",
    };
  }

  return {
    context: null,
    detail: (
      <VisualizationDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
    ),
    main: <VisualizationPanel view={view} />,
    mainSpan: "standard",
  };
}

function placeholderSlots(activityId: "data" | "search"): ActivitySlots {
  const label = activityId === "search" ? "搜索" : "数据";

  return {
    context: null,
    detail: null,
    main: (
      <PlaceholderPanel
        description={`${label}功能待接入。`}
        title={label}
      />
    ),
    mainSpan: "full",
  };
}

export function createActivitySlots({
  activityId,
  onCollapseDetail,
  onConfigureSyntax,
  view,
}: ActivityContext): ActivitySlots {
  switch (activityId) {
    case "notes":
      return notesSlots({ onCollapseDetail, onConfigureSyntax, view });
    case "migration":
      return migrationSlots({ onConfigureSyntax, view });
    case "syntax":
      return syntaxSlots({ onCollapseDetail, view });
    case "visualization":
      return visualizationSlots({ onCollapseDetail, onConfigureSyntax, view });
    case "settings":
      return {
        context: null,
        detail: null,
        main: <SettingsPanel view={view} />,
        mainSpan: "full",
      };
    case "data":
    case "search":
      return placeholderSlots(activityId);
  }
}
