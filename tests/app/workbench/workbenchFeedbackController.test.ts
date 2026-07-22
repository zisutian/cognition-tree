// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createWorkbenchFeedbackController,
  maximumWorkbenchErrorsPerScope,
  workbenchFeedbackDurationMs,
} from "../../../application/workbench/workbenchFeedbackController";

describe("workbench feedback controller", () => {
  it("publishes the latest transient message and restores after five seconds", () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const controller = createWorkbenchFeedbackController<"notes" | "todo">({
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
    expect(scheduled.at(-1)?.delayMs).toBe(workbenchFeedbackDurationMs);

    scheduled.at(-1)?.callback();
    expect(controller.getSnapshot().transient).toBeNull();
  });

  it("deduplicates errors, keeps the latest occurrence, and caps each scope", () => {
    const controller = createWorkbenchFeedbackController<"notes" | "todo">({
      scheduler: { schedule: () => () => undefined },
    });
    const firstId = controller.reportError("notes", "保存失败");
    const repeatedId = controller.reportError("notes", "保存失败");

    expect(repeatedId).toBe(firstId);
    expect(controller.getSnapshot().errors).toHaveLength(1);

    for (let index = 0; index <= maximumWorkbenchErrorsPerScope; index += 1) {
      controller.reportError("notes", `错误 ${index}`);
    }
    controller.reportError("todo", "代办错误");

    expect(
      controller.getSnapshot().errors.filter(({ scope }) => scope === "notes"),
    ).toHaveLength(maximumWorkbenchErrorsPerScope);
    expect(
      controller.getSnapshot().errors.filter(({ scope }) => scope === "todo"),
    ).toHaveLength(1);
  });

  it("supports subscription, individual dismissal, and scope cleanup", () => {
    const controller = createWorkbenchFeedbackController<"notes" | "todo">({
      scheduler: { schedule: () => () => undefined },
    });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    const notesId = controller.reportError("notes", "笔记失败");

    controller.reportError("todo", "代办失败");
    controller.dismiss(notesId);
    expect(controller.getSnapshot().errors.map(({ scope }) => scope)).toEqual([
      "todo",
    ]);
    controller.dismissScope("todo");
    expect(controller.getSnapshot().errors).toEqual([]);
    expect(controller.getSnapshot().transient).toBeNull();
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    controller.reportInfo("notes", "不会通知旧订阅者");
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
