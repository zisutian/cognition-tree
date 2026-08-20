// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  resolveTodoRetry,
  TodoActivityController,
} from "../../../../presentation/activities/todo/TodoActivityController";
import type { WorkbenchApplication } from "../../../../presentation/activities/workbenchApplication";
import { createTodoView } from "../../fixtures/todoViewFixture";
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
    journal: { status: "loading" },
    repository: {} as WorkbenchApplication["repository"],
    search: {} as WorkbenchApplication["search"],
    todo: {
      reload: async () => undefined,
      status: "ready",
      view: createTodoView(),
    },
    workspace: { status: "absent" },
  };
}

describe("TodoActivityController", () => {
  it("renders Todo independently when no ordinary repository exists", () => {
    const application = createApplicationWithoutWorkspace();
    const rendered = TodoActivityController({
      active: true,
      application,
      onActiveActivityChange: () => undefined,
      renderActivity: (createSlots) => {
        const slots = createSlots(controls);

        expect(slots.detail).not.toBeNull();
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
    expect(markup).not.toContain("前往仓库");
  });

  it("does not mount Todo slots while another activity is active", () => {
    const rendered = TodoActivityController({
      active: false,
      application: createApplicationWithoutWorkspace(),
      onActiveActivityChange: () => undefined,
      renderActivity: () => {
        throw new Error("inactive Todo must not render");
      },
    });

    expect(rendered).toBeNull();
  });

  it("retries a faulted Todo descriptor through the system catalog", async () => {
    const retryBuiltIn = vi.fn(async () => undefined);
    const reload = vi.fn(async () => undefined);
    const retry = resolveTodoRetry(
      { reload: vi.fn(async () => undefined), status: "unavailable" },
      {
        catalog: {
          catalogLabel: "内置仓库",
          reload,
          retry: retryBuiltIn,
          state: {
            issues: [{
              code: "repository_corrupt",
              id: "todo",
              location: null,
              message: "代办仓库损坏。",
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

    expect(retryBuiltIn).toHaveBeenCalledWith("todo");
    expect(reload).not.toHaveBeenCalled();
  });
});
