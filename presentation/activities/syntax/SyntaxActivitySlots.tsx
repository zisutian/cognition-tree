import {
  isAvailableSyntaxViewModel,
  type SyntaxViewModel,
} from "../../../application/syntax/index.ts";
import "./syntax.css";
import type { ActivitySlots } from "../../ui/index.ts";
import { SyntaxContext } from "./SyntaxContext.tsx";
import { SyntaxDetailPanel } from "./SyntaxDetailPanel.tsx";
import { SyntaxMainPanel } from "./SyntaxMainPanel.tsx";

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
    detail: view.isConfigured && isAvailableSyntaxViewModel(view) ? (
      <SyntaxDetailPanel onCollapseDetail={onCollapseDetail} view={view} />
    ) : null,
    main: <SyntaxMainPanel view={view} />,
  };
}
