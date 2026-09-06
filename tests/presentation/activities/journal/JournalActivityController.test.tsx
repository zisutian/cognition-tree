// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  JournalActivityController,
  resolveJournalRetry,
} from "../../../../presentation/activities/journal/JournalActivityController";
import type { WorkbenchApplication } from "../../../../presentation/shell/application/workbenchApplication";
import { createJournalView } from "../../fixtures/journalViewFixture";
import { createAgentApplicationFixture } from "../../fixtures/agentApplicationFixture";

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
    agent: createAgentApplicationFixture(),
    apiAccess: {
      administration: {} as WorkbenchApplication["apiAccess"]["administration"],
      repositories: [],
    },
    journal: {
      reload: async () => undefined,
      status: "ready",
      view: createJournalView(),
    },
    operations: {} as WorkbenchApplication["operations"],
    repository: {} as WorkbenchApplication["repository"],
    search: {} as WorkbenchApplication["search"],
    system: {} as WorkbenchApplication["system"],
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
    expect(markup.length).toBeGreaterThan(0);
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
    const retryBuiltIn = vi.fn(async () => undefined);
    const reload = vi.fn(async () => undefined);
    const retry = resolveJournalRetry(
      { reload: vi.fn(async () => undefined), status: "unavailable" },
      {
        catalog: {
          catalogLabel: "内置仓库",
          reload,
          retry: retryBuiltIn,
          state: {
            issues: [{
              code: "repository_corrupt",
              id: "journal",
              location: null,
              message: "日记仓库损坏。",
              status: "fault",
            }],
            repositories: [],
            retryingId: null,
            status: "ready",
          },
        },
        sessions: {} as WorkbenchApplication["repository"]["builtIns"]["sessions"],
      },
    );

    await retry?.();

    expect(retryBuiltIn).toHaveBeenCalledWith("journal");
    expect(reload).not.toHaveBeenCalled();
  });
});
