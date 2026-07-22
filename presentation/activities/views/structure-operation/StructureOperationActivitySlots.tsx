import type { StructureOperationActivityViewModel } from "../../../../application/workspace/activities/structure-operation/structureOperationViewModel";
import "../../../ui/styles/activities/structure-operation.css";
import type { WorkspaceShell } from "../../bindings/workspace/runtime/useWorkspaceApplication";
import type { ActivitySlots } from "../../../ui/activityTypes";
import { SyntaxUnavailablePanel } from "../../../ui/SyntaxUnavailablePanel";
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
      <SyntaxUnavailablePanel
        featureName="结构操作"
        onConfigureSyntax={onConfigureSyntax}
      />
    ),
  };
}
