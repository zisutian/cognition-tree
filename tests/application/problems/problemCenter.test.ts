// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createProblemCenter } from "../../../application/problems/problemCenter";

describe("problem center", () => {
  it("rejects reports, subscriptions, and timer publication after disposal", () => {
    const cancelTransient = vi.fn();
    let expireTransient: () => void = () => undefined;
    const controller = createProblemCenter<"notes">({
      scheduler: {
        schedule(callback) {
          expireTransient = callback;
          return cancelTransient;
        },
      },
    });
    const listener = vi.fn();

    controller.subscribe(listener);
    controller.reportInfo("notes", "已保存。");
    const terminalSnapshot = controller.getSnapshot();

    controller.dispose();
    expect(cancelTransient).toHaveBeenCalledOnce();
    expect(controller.reportError("notes", "迟到的失败")).toBeNull();
    controller.reportInfo("notes", "迟到的消息");
    controller.dismissScope("notes");
    controller.subscribe(listener);
    expireTransient();

    expect(controller.getSnapshot()).toBe(terminalSnapshot);
    expect(listener).toHaveBeenCalledOnce();
  });
});
