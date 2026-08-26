// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  hasWorkbenchProblemsPanel,
  projectPersistenceStatus,
} from "../../../../presentation/shell/workbench/workbenchProblemsPanelProjection";

describe("workbench Problems panel projection", () => {
  it("projects only non-stable persistence states", () => {
    expect(projectPersistenceStatus("笔记", { status: "saved" })).toBe("");
    expect(projectPersistenceStatus("日记", { status: "saving-local" }))
      .toBe("日记 · 正在保存");
    expect(projectPersistenceStatus("代办", { status: "pending-sync" }))
      .toBe("代办 · 等待同步");
    expect(projectPersistenceStatus("笔记", {
      pendingChanges: true,
      status: "offline",
    })).toBe("笔记 · 离线");
    expect(projectPersistenceStatus("笔记", {
      remoteRevision: "remote-revision",
      status: "conflict",
    })).toBe("笔记 · 同步冲突");
  });

  it("shows the global Problems panel in every Activity including Settings", () => {
    expect(hasWorkbenchProblemsPanel("settings")).toBe(true);
    expect(hasWorkbenchProblemsPanel("todo")).toBe(true);
    expect(hasWorkbenchProblemsPanel("journal")).toBe(true);
    expect(hasWorkbenchProblemsPanel("repository")).toBe(true);
    expect(hasWorkbenchProblemsPanel("notes")).toBe(true);
  });
});
