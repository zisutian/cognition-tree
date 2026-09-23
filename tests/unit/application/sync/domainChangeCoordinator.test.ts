// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DomainChangeCoordinator, DomainRevisionTracker } from "../../../../application/sync/index.ts";

const first = `sha256:${"a".repeat(64)}` as const;
const second = `sha256:${"b".repeat(64)}` as const;

describe("DomainChangeCoordinator", () => {
  it("publishes only changed observations and reconciles removed repositories once", () => {
    const events: {checkpoint: ReturnType<DomainChangeCoordinator["checkpoint"]>; resources: unknown[]}[] = [];
    const coordinator = new DomainChangeCoordinator(new DomainRevisionTracker(), {
      now: () => "2026-09-23T00:00:00.000Z",
      sequence: () => events.length,
      streamId: () => "test-stream",
      publish: (checkpoint, changes) => events.push({checkpoint, resources: changes.resources}),
    });

    coordinator.observeWorkspace("workspace-a", first);
    coordinator.observeWorkspace("workspace-a", first);
    coordinator.observeDomain("journal", first);
    coordinator.observeDomain("journal", first);
    expect(events).toHaveLength(0);

    coordinator.observeWorkspace("workspace-a", second);
    coordinator.observeDomain("journal", second);
    expect(events).toHaveLength(2);
    expect(events[0]?.checkpoint.workspaces).toEqual({"workspace-a": second});
    expect(events[1]?.checkpoint.journal).toBe(second);

    coordinator.reconcileWorkspaceIds(new Set());
    coordinator.reconcileWorkspaceIds(new Set());
    expect(events).toHaveLength(3);
    expect(events[2]?.resources).toEqual([{
      domain: "workspace",
      kind: "deleted",
      repositoryId: "workspace-a",
      resourceId: "workspace-a",
    }]);
    expect(coordinator.checkpoint().workspaces).toEqual({});
  });
});
