import type { SyntaxViewModel } from "../../../application/workspace/activities/syntax/syntaxViewModel";
import type { ActivitySlots } from "../../activityTypes";
import { SyntaxDetailPanel } from "./SyntaxDetailPanel";
import { SyntaxMainPanel } from "./SyntaxMainPanel";

export function createSyntaxActivitySlots({
  onCollapseDetail,
  view,
}: {
  onCollapseDetail: () => void;
  view: SyntaxViewModel;
}): ActivitySlots {
  return {
    context: null,
    detail: (
      <SyntaxDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
    ),
    main: <SyntaxMainPanel view={view} />,
  };
}
