import { renderToStaticMarkup } from "../../../../support/presentation/render";
import { describe, it } from "vitest";
import { WorkspaceUnavailablePanel } from "../../../../../presentation/activities/unavailable/WorkspaceUnavailablePanel";
import { expectMarkupSemantics } from "../../../../support/presentation/markupSemantics";

describe("workspace unavailable activity", () => {
  it.each([
    [
      "absent",
      { status: "absent" },
      {
        has: ["尚未创建笔记仓库", ">前往仓库<"],
        lacks: ["重试挂载"],
      },
    ],
    [
      "loading",
      { status: "loading", storageLabel: "服务端仓库" },
      { has: ["正在载入笔记仓库"] },
    ],
    [
      "failed",
      {
        errorMessage: "普通仓库目录不可用。",
        retry: async () => undefined,
        status: "failed",
        storageLabel: "服务端仓库",
      },
      {
        has: ["笔记仓库无法挂载", ">重试挂载<", ">前往仓库<"],
        lacks: ["普通仓库目录不可用。"],
      },
    ],
  ] as const)(
    "renders the %s state semantics",
    (_name, workspace, semantics) => {
      const markup = renderToStaticMarkup(
        <WorkspaceUnavailablePanel
          onOpenRepository={() => undefined}
          workspace={workspace}
        />,
      );

      expectMarkupSemantics(markup, semantics);
    },
  );
});
