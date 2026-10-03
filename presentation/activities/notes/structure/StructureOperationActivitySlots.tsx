import type { StructureOperationActivityViewModel } from "../../../../application/workspace/index.ts";
import type { ActivitySlots } from "../../../ui/index.ts";
import type { WorkspaceShell } from "../../../workspace/index.ts";
import { SyntaxUnavailablePanel } from "../SyntaxUnavailablePanel.tsx";
import { StructureOperationContext } from "./StructureOperationContext.tsx";
import { StructureOperationMainPanel } from "./StructureOperationPanels.tsx";
import type { NotesDirectorySelection } from "../useNotesDirectorySelection.ts";

export function createStructureOperationActivitySlots({
  directorySelection,
  onConfigureSyntax,
  shell,
  view,
}: {
  directorySelection: NotesDirectorySelection;
  onConfigureSyntax: () => void;
  shell: WorkspaceShell;
  view: StructureOperationActivityViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <StructureOperationContext view={view} directorySelection={directorySelection} />,
      title: "结构操作",
    },
    detail: null,
    main: {
      title: "结构操作",
      layout: "canvas",
      content: shell.hasConfiguredSyntax ? (
        <StructureOperationMainPanel view={view} />
      ) : (
        <SyntaxUnavailablePanel
          featureName="结构操作"
          onConfigureSyntax={onConfigureSyntax}
        />
      ),
    },
  };
}
