import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import "./structure.css";
import type { WorkspaceShell } from "../../../workspace/index.ts";
import type { ActivitySlots } from "../../../ui/index.ts";
import { SyntaxUnavailablePanel } from "../SyntaxUnavailablePanel.tsx";
import { StructureOperationContext } from "./StructureOperationContext.tsx";
import { StructureOperationMainPanel } from "./StructureOperationPanels.tsx";

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
