// SPDX-License-Identifier: GPL-3.0-or-later

import { renderToStaticMarkup } from "../../../../support/presentation/render";

import { describe, expect, it, vi } from "vitest";
import {
  JournalActivityController,
  resolveJournalRetry,
} from "../../../../../presentation/activities/journal/JournalActivityController";
import type { WorkbenchApplication } from "../../../../../presentation/shell/application/workbenchApplication";
import { createAgentApplicationFixture } from "../../../../support/presentation/fixtures/agentApplicationFixture";
import { createJournalView } from "../../../../support/presentation/fixtures/journalViewFixture";

function createApplicationWithoutWorkspace(): WorkbenchApplication {
  return {
    agent: createAgentApplicationFixture(),
    localApi: {
      serviceOrigin: "http://localhost:3001",
      getOperation: async () => {
        throw new Error("not requested");
      },
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
  it("does not mount Journal slots while another activity is active", () => {
    const rendered = renderToStaticMarkup(
      <JournalActivityController
        {...{
          active: false,
          application: createApplicationWithoutWorkspace(),
          onActiveActivityChange: () => undefined,
          renderActivity: () => {
            throw new Error("inactive Journal must not render");
          },
        }}
      />,
    );

    expect(rendered).not.toContain("<section");
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
            issues: [
              {
                code: "repository_corrupt",
                id: "journal",
                location: null,
                message: "日记仓库损坏。",
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

    expect(retryBuiltIn).toHaveBeenCalledWith("journal");
    expect(reload).not.toHaveBeenCalled();
  });
});
