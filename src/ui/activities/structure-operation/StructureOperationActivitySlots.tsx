import type { StructureOperationActivityViewModel } from "../../../application/workspace/activities/structure-operation/structureOperationViewModel";
import "../../styles/activities/structure-operation.css";
import type { WorkspaceShell } from "../../../application/workspace/runtime/useWorkspaceApplication";
import type { ActivitySlots } from "../../activityTypes";
import { WorkspaceSyntaxSetupView } from "../../WorkspaceSyntaxSetupView";
import { StructureOperationContext } from "./StructureOperationContext";
import { StructureOperationMainPanel } from "./StructureOperationPanels";

export function createStructureOperationActivitySlots({
  onConfigureSyntax,
  shell,
  view,
}: {
  onConfigureSyntax: () => void;
  shell: WorkspaceShell;
  view: StructureOperationActivityViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <StructureOperationContext view={view} />,
      title: "结构操作",
    },
    detail: null,
    main: shell.hasConfiguredSyntax ? (
      <StructureOperationMainPanel view={view} />
    ) : (
      <WorkspaceSyntaxSetupView
        errorMessage={shell.errorMessage}
        onConfigureSyntax={onConfigureSyntax}
        onUseDefaultSyntax={shell.useDefaultSyntax}
      />
    ),
  };
}
