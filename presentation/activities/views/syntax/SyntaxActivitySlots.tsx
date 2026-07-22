import type { SyntaxViewModel } from "../../../../application/syntax/syntaxViewModel";
import "../../../ui/styles/activities/syntax.css";
import type { ActivitySlots } from "../../../ui/activityTypes";
import { SyntaxContext } from "./SyntaxContext";
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
    context: {
      content: <SyntaxContext view={view} />,
      title: "语法",
    },
    detail: view.isConfigured ? (
      <SyntaxDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
    ) : null,
    main: <SyntaxMainPanel view={view} />,
  };
}
