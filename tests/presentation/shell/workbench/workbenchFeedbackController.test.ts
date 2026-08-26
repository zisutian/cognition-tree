// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createProblemCenter,
  maximumOperationalProblems,
  problemCenterTransientDurationMs,
} from "../../../../application/problems/problemCenter";

describe("workbench feedback controller", () => {
  it("publishes the latest transient message and restores after five seconds", () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const controller = createProblemCenter<"notes" | "todo">({
      scheduler: {
        schedule(callback, delayMs) {
          scheduled.push({ callback, delayMs });
          return vi.fn();
        },
      },
    });

    controller.reportInfo("notes", "路径已复制。");
    expect(controller.getSnapshot().transient).toMatchObject({
      message: "路径已复制。",
      scope: "notes",
      tone: "info",
    });
    controller.reportInfo("todo", "集合已创建。");
    expect(controller.getSnapshot().transient).toMatchObject({
      message: "集合已创建。",
      scope: "todo",
    });
    expect(scheduled.at(-1)?.delayMs).toBe(problemCenterTransientDurationMs);

    scheduled.at(-1)?.callback();
    expect(controller.getSnapshot().transient).toBeNull();
  });

  it("aggregates repeated failures and caps the global operational history", () => {
    let instant = 0;
    const controller = createProblemCenter<"notes" | "todo">({
      now: () => new Date(`2026-08-26T00:00:${String(instant++).padStart(2, "0")}.000Z`),
      scheduler: { schedule: () => () => undefined },
    });
    const firstId = controller.reportError("notes", "保存失败");
    const repeatedId = controller.reportError("notes", "保存失败");

    expect(repeatedId).toBe(firstId);
    expect(controller.getSnapshot().problems).toEqual([
      expect.objectContaining({
        firstOccurredAt: "2026-08-26T00:00:00.000Z",
        lastOccurredAt: "2026-08-26T00:00:01.000Z",
        occurrenceCount: 2,
        requestId: null,
        target: { scope: "notes", sessionId: null },
      }),
    ]);

    for (let index = 0; index <= maximumOperationalProblems; index += 1) {
      controller.report({
        code: "indexed_failure",
        details: { index },
        message: `错误 ${index}`,
        source: "ui-action",
        target: { scope: "notes" },
      });
    }
    controller.reportError("todo", "代办错误");

    expect(controller.getSnapshot().problems).toHaveLength(
      maximumOperationalProblems,
    );
    expect(controller.getSnapshot().problems.at(-1)?.target.scope).toBe("todo");
  });

  it("supports subscription, individual dismissal, and scope cleanup", () => {
    const controller = createProblemCenter<"notes" | "todo">({
      scheduler: { schedule: () => () => undefined },
    });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    const notesId = controller.reportError("notes", "笔记失败");

    controller.reportError("todo", "代办失败");
    controller.dismiss(notesId);
    expect(controller.getSnapshot().problems.map(({ target }) => target.scope)).toEqual([
      "todo",
    ]);
    controller.dismissScope("todo");
    expect(controller.getSnapshot().problems).toEqual([]);
    expect(controller.getSnapshot().transient).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    controller.reportInfo("notes", "不会通知旧订阅者");
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
