import {
  isAvailableSyntaxViewModel,
  type SyntaxViewModel,
} from "../../../application/syntax/index.ts";
import type { ActivitySlots } from "../../ui/index.ts";
import { SyntaxContext } from "./SyntaxContext.tsx";
import { SyntaxDetailPanel } from "./SyntaxDetailPanel.tsx";
import { SyntaxDraftStatus } from "./SyntaxDraftStatus.tsx";
import { SyntaxMainPanel } from "./SyntaxMainPanel.tsx";

export function createSyntaxActivitySlots({
  view,
}: {
  view: SyntaxViewModel;
}): ActivitySlots {
  return {
    context: {
      content: <SyntaxContext view={view} />,
      title: "语法",
      layout: "canvas",
    },
    detail:
      view.isConfigured && isAvailableSyntaxViewModel(view)
        ? {
            title: "语法详情",
            layout: "detail",
            content: <SyntaxDetailPanel view={view} />,
          }
        : null,
    main: {
      title: isAvailableSyntaxViewModel(view)
        ? view.draft.name || "未命名语法"
        : "语法配置",
      layout: "form",
      footer: view.hasDraftErrors ? (
        <SyntaxDraftStatus view={view} />
      ) : undefined,
      content: <SyntaxMainPanel view={view} />,
    },
  };
}
