// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "../../../../support/presentation/render";

import { describe, expect, it, vi } from "vitest";
import {
  resolveTodoRetry,
  TodoActivityController,
} from "../../../../../presentation/activities/todo/TodoActivityController";
import type { WorkbenchApplication } from "../../../../../presentation/shell/application/workbenchApplication";
import { createAgentApplicationFixture } from "../../../../support/presentation/fixtures/agentApplicationFixture";
import { createTodoView } from "../../../../support/presentation/fixtures/todoViewFixture";

function createApplicationWithoutWorkspace(): WorkbenchApplication {
  return {
    agent: createAgentApplicationFixture(),
    localApi: {
      serviceOrigin: "http://localhost:3001",
      getOperation: async () => {
        throw new Error("not requested");
      },
    },
    journal: { status: "loading" },
    operations: {} as WorkbenchApplication["operations"],
    repository: {} as WorkbenchApplication["repository"],
    search: {} as WorkbenchApplication["search"],
    system: {} as WorkbenchApplication["system"],
    todo: {
      reload: async () => undefined,
      status: "ready",
      view: createTodoView(),
    },
    workspace: { status: "absent" },
  };
}

describe("TodoActivityController", () => {
  it("does not mount Todo slots while another activity is active", () => {
    const rendered = renderToStaticMarkup(
      <TodoActivityController
        {...{
          active: false,
          application: createApplicationWithoutWorkspace(),
          onActiveActivityChange: () => undefined,
          renderActivity: () => {
            throw new Error("inactive Todo must not render");
          },
        }}
      />,
    );

    expect(rendered).not.toContain("<section");
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
            issues: [
              {
                code: "repository_corrupt",
                id: "todo",
                location: null,
                message: "代办仓库损坏。",
                status: "fault",
              },
            ],
            repositories: [],
            retryingId: null,
            status: "ready",
          },
        },
        sessions:
          {} as WorkbenchApplication["repository"]["builtIns"]["sessions"],
      },
    );

    await retry?.();

    expect(retryBuiltIn).toHaveBeenCalledWith("todo");
    expect(reload).not.toHaveBeenCalled();
  });
});
