// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createWorkbenchNavigation } from "../../../../presentation/shell/workbench/workbenchNavigation";

describe("workbench navigation admission", () => {
  it.each(["settings", "syntax"] as const)(
    "checks %s before changing a destination and never replays a rejected request",
    (activity) => {
      const navigation = createWorkbenchNavigation(activity);
      navigation.reportInteraction(activity, {
        navigationBlocked: true,
        statusMessage: "待处理",
      });
      const changeDestination = vi.fn();
      expect(navigation.request("notes", changeDestination)).toBe(false);
      expect(changeDestination).not.toHaveBeenCalled();
      expect(navigation.getSnapshot().activeActivityId).toBe(activity);
      navigation.reportInteraction(activity, {
        navigationBlocked: false,
        statusMessage: "",
      });
      expect(changeDestination).not.toHaveBeenCalled();
      expect(navigation.request("notes", changeDestination)).toBe(true);
      expect(changeDestination).toHaveBeenCalledOnce();
    },
  );

  it("allows same-activity actions and ignores an inactive activity's guard", () => {
    const navigation = createWorkbenchNavigation("settings");
    navigation.reportInteraction("settings", {
      navigationBlocked: true,
      statusMessage: "未保存",
    });
    expect(navigation.request("settings")).toBe(true);
    navigation.reportInteraction("settings", {
      navigationBlocked: false,
      statusMessage: "",
    });
    navigation.request("notes");
    navigation.reportInteraction("settings", {
      navigationBlocked: true,
      statusMessage: "未保存",
    });
    expect(navigation.request("journal")).toBe(true);
  });
});
