import { describe, expect, it } from "vitest";

import {
  activityDescriptors,
  listActivityDescriptors,
} from "../../../../../presentation/shell/workbench/activityCatalog";

describe("activity catalog", () => {
  it("keeps catalog and lazy-controller order aligned", () => {
    expect(
      listActivityDescriptors("primary").map(({ id, label }) => [id, label]),
    ).toEqual([
      ["notes", "笔记"],
      ["journal", "日记"],
      ["todo", "代办"],
      ["syntax", "语法"],
    ]);
    expect(
      listActivityDescriptors("management").map(({ id, label }) => [id, label]),
    ).toEqual([
      ["agent", "智能体"],
      ["search", "搜索"],
      ["repository", "仓库"],
      ["settings", "设置"],
    ]);
    expect(activityDescriptors.map(({ id }) => id)).toEqual([
      "notes",
      "journal",
      "todo",
      "syntax",
      "agent",
      "search",
      "repository",
      "settings",
    ]);
  });
});
