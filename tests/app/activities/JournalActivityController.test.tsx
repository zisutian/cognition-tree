import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  JournalActivityController,
  resolveJournalRetry,
} from "../../../src/app/activities/JournalActivityController";
import type { WorkbenchApplication } from "../../../src/application/workbench/workbenchApplication";
import { createView } from "../../ui/viewFactory";

const controls = {
  contextWidth: 280,
  focusMode: false,
  onCollapseDetail: () => undefined,
  onConfigureSyntax: () => undefined,
  onContextWidthChange: () => undefined,
  onToggleFocusMode: () => undefined,
};

function createApplicationWithoutWorkspace(): WorkbenchApplication {
  return {
    journal: {
      reload: async () => undefined,
      status: "ready",
      view: createView().journal,
    },
    repository: {} as WorkbenchApplication["repository"],
    todo: { status: "loading" },
    workspace: { status: "absent" },
  };
}

describe("JournalActivityController", () => {
  it("renders the ready Journal independently when no ordinary repository exists", () => {
    const application = createApplicationWithoutWorkspace();
    const rendered = JournalActivityController({
      active: true,
      application,
      onActiveActivityChange: () => undefined,
      renderActivity: (createSlots) => {
        const slots = createSlots(controls);

        return (
          <>
            {slots.context?.content}
            {slots.main}
            {slots.detail}
          </>
        );
      },
    });
    const markup = renderToStaticMarkup(<>{rendered}</>);

    expect(application.workspace.status).toBe("absent");
    expect(markup).toContain("2026 年 1 月");
    expect(markup).toContain('aria-label="日记编辑"');
    expect(markup).toContain('data-editor-mode="body"');
    expect(markup).not.toContain("前往仓库创建");
  });

  it("does not mount Journal slots while another activity is active", () => {
    const rendered = JournalActivityController({
      active: false,
      application: createApplicationWithoutWorkspace(),
      onActiveActivityChange: () => undefined,
      renderActivity: () => {
        throw new Error("inactive Journal must not render");
      },
    });

    expect(rendered).toBeNull();
  });

  it("retries a faulted Journal descriptor instead of reloading an unavailable session", async () => {
    const retryRepository = vi.fn(async () => undefined);
    const reload = vi.fn(async () => undefined);
    const retry = resolveJournalRetry(
      { reload: vi.fn(async () => undefined), status: "unavailable" },
      {
        catalog: {
          catalogLabel: "内置仓库",
          reload,
          retryRepository,
          state: {
            issues: [{
              code: "repository_corrupt",
              id: "system-journal",
              location: null,
              message: "日记仓库损坏。",
              status: "fault",
            }],
            repositories: [],
            retryingPurpose: null,
            status: "ready",
          },
        },
        repositories: {},
        sessions: {} as WorkbenchApplication["repository"]["systems"]["sessions"],
      },
    );

    await retry?.();

    expect(retryRepository).toHaveBeenCalledWith("system-journal");
    expect(reload).not.toHaveBeenCalled();
  });
});
