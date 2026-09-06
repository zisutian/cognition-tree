import type { VisualizationViewModel } from "../../../../application/workspace/index.ts";
import "./graph.css";
import type { WorkspaceShell } from "../../../workspace/index.ts";
import type { ActivitySlots } from "../../../ui/index.ts";
import { SyntaxUnavailablePanel } from "../SyntaxUnavailablePanel.tsx";
import { VisualizationContext } from "./VisualizationContext.tsx";
import { VisualizationDetailPanel } from "./VisualizationDetailPanel.tsx";
import { VisualizationPanel } from "./VisualizationPanel.tsx";
import type {
  ReferenceGraphSession,
} from "./useReferenceGraphSession.ts";

export function createVisualizationActivitySlots({
  onCollapseDetail,
  onConfigureSyntax,
  session,
  shell,
  view,
}: {
  onCollapseDetail: () => void;
  onConfigureSyntax: () => void;
  session: ReferenceGraphSession;
  shell: WorkspaceShell;
  view: VisualizationViewModel;
}): ActivitySlots {
  if (!shell.hasConfiguredSyntax) {
    return {
      context: null,
      detail: null,
      main: (
        <SyntaxUnavailablePanel
          featureName="引用图谱"
          onConfigureSyntax={onConfigureSyntax}
        />
      ),
    };
  }

  return {
    context: {
      content: <VisualizationContext session={session} view={view} />,
      title: "引用图谱",
    },
    detail: (
      <VisualizationDetailPanel
        onCollapseDetail={onCollapseDetail}
        view={view}
      />
    ),
    main: <VisualizationPanel session={session} view={view} />,
  };
}
