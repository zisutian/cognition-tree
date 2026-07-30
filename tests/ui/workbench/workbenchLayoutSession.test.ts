// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  defaultRepositoryProblemsLayout,
  readRepositoryContextWidth,
  readRepositoryProblemsLayout,
  writeRepositoryContextWidth,
  writeRepositoryProblemsLayout,
} from "../../../presentation/ui/workbench/workbenchLayoutSession";
import {
  appContextMinWidth,
  appProblemsMaxHeight,
} from "../../../presentation/ui/workbench/frameResize";

describe("workbench layout session", () => {
  it("keeps clamped panel state independently per repository in memory", () => {
    writeRepositoryContextWidth("layout-alpha", appContextMinWidth - 100);
    writeRepositoryProblemsLayout("layout-alpha", {
      expanded: true,
      height: 248,
    });
    writeRepositoryProblemsLayout("layout-clamped", {
      expanded: true,
      height: 999,
    });

    expect(readRepositoryContextWidth("layout-alpha")).toBe(appContextMinWidth);
    expect(readRepositoryContextWidth("layout-beta")).toBeNull();
    expect(readRepositoryProblemsLayout("layout-alpha")).toEqual({
      expanded: true,
      height: 248,
    });
    expect(readRepositoryProblemsLayout("layout-beta")).toEqual(
      defaultRepositoryProblemsLayout,
    );
    expect(readRepositoryProblemsLayout("layout-clamped").height).toBe(
      appProblemsMaxHeight,
    );
  });
});
