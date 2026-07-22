import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceUnavailablePanel } from "../../presentation/activities/views/WorkspaceUnavailablePanel";

describe("workspace unavailable activity", () => {
  it("keeps a repository entry point when no ordinary repository exists", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceUnavailablePanel
        onOpenRepository={() => undefined}
        workspace={{ status: "absent" }}
      />,
    );

    expect(markup).toContain("尚未创建笔记仓库");
    expect(markup).toContain("请先前往仓库活动创建一个普通仓库。");
    expect(markup).toContain(">前往仓库<");
    expect(markup).not.toContain("重试挂载");
  });

  it("distinguishes catalog loading from mount failure and retains both retries", () => {
    const loading = renderToStaticMarkup(
      <WorkspaceUnavailablePanel
        onOpenRepository={() => undefined}
        workspace={{ status: "loading", storageLabel: "服务端仓库" }}
      />,
    );
    const failed = renderToStaticMarkup(
      <WorkspaceUnavailablePanel
        onOpenRepository={() => undefined}
        workspace={{
          errorMessage: "普通仓库目录不可用。",
          retry: vi.fn(async () => undefined),
          status: "failed",
          storageLabel: "服务端仓库",
        }}
      />,
    );

    expect(loading).toContain("正在载入笔记仓库");
    expect(loading).toContain("正在从服务端仓库读取内容。");
    expect(failed).toContain("笔记仓库无法挂载");
    expect(failed).toContain("普通仓库目录不可用。");
    expect(failed).toContain(">重试挂载<");
    expect(failed).toContain(">前往仓库<");
  });
});
