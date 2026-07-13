import type { ViewModel } from "../../application/workspace/view-model/activityViewModels";
import type {
  ActivityId,
  ActivitySlots,
} from "../activityTypes";
import {
  StructureOperationContext,
  StructureOperationMainPanel,
} from "./structure-operation/StructureOperationPanels";
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
      errorMessage={view.shell.errorMessage}
      onConfigureSyntax={onConfigureSyntax}
      onUseDefaultSyntax={view.shell.useDefaultSyntax}
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
      content: <NotesContext view={view.notes} />,
      title: "笔记",
    },
    detail:
      view.shell.hasConfiguredSyntax && view.notes.editor.hasParsedDocument ? (
        <NoteDetailPanel onCollapseDetail={onCollapseDetail} view={view.notes} />
      ) : null,
    main:
      view.shell.hasConfiguredSyntax && view.notes.editor.hasParsedDocument ? (
        <NoteEditorPanel view={view.notes} />
      ) : (
        syntaxSetup({ onConfigureSyntax, view })
      ),
  };
}

function structureOperationSlots({
  onConfigureSyntax,
  view,
}: Pick<ActivityContext, "onConfigureSyntax" | "view">): ActivitySlots {
  return {
    context: {
      content: <StructureOperationContext view={view.structureOperation} />,
      title: "结构操作",
    },
    detail: null,
    main: view.shell.hasConfiguredSyntax ? (
      <StructureOperationMainPanel view={view.structureOperation} />
    ) : (
      syntaxSetup({ onConfigureSyntax, view })
    ),
  };
}

function syntaxSlots({
  onCollapseDetail,
  view,
}: Pick<ActivityContext, "onCollapseDetail" | "view">): ActivitySlots {
  return {
    context: null,
    detail: <SyntaxDetailPanel onCollapseDetail={onCollapseDetail} view={view.syntax} />,
    main: <SyntaxMainPanel view={view.syntax} />,
  };
}

function visualizationSlots({
  onCollapseDetail,
  onConfigureSyntax,
  view,
}: Pick<ActivityContext, "onCollapseDetail" | "onConfigureSyntax" | "view">): ActivitySlots {
  if (!view.shell.hasConfiguredSyntax) {
    return {
      context: null,
      detail: null,
      main: syntaxSetup({ onConfigureSyntax, view }),
    };
  }

  return {
    context: null,
    detail: (
      <VisualizationDetailPanel
        onCollapseDetail={onCollapseDetail}
        view={view.visualization}
      />
    ),
    main: <VisualizationPanel view={view.visualization} />,
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
    case "structure-operation":
      return structureOperationSlots({ onConfigureSyntax, view });
    case "syntax":
      return syntaxSlots({ onCollapseDetail, view });
    case "visualization":
      return visualizationSlots({ onCollapseDetail, onConfigureSyntax, view });
    case "settings":
      return {
        context: null,
        detail: null,
        main: <SettingsPanel view={view.settings} />,
      };
    case "data":
    case "search":
      return placeholderSlots(activityId);
  }
}
