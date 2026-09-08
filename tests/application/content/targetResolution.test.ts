// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  ContentTargetError,
  resolveNamedContent,
} from "../../../application/content/index.ts";

const resources = [
  { id: "one", name: "进程", path: "操作系统/进程" },
  { id: "two", name: "进程", path: "复习/操作系统/进程" },
  { id: "three", name: "Café 学习", path: "语言/Café 学习" },
];
describe("semantic content targeting", () => {
  it("requires a unique exact title or full logical relative path", () => {
    expect(resolveNamedContent(resources, "操作系统/进程").id).toBe("one");
    expect(resolveNamedContent(resources, "复习/操作系统/进程").id).toBe("two");
    try {
      resolveNamedContent(resources, "进程");
      throw new Error("Expected ambiguity.");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentTargetError);
      expect(error).toMatchObject({
        code: "target_ambiguous",
        candidates: ["操作系统/进程", "复习/操作系统/进程"],
      });
    }
    expect(() => resolveNamedContent(resources, "操作系")).toThrow(
      "No exact target",
    );
  });
  it("uses existing Unicode, whitespace and case normalization without shortening names", () => {
    expect(resolveNamedContent(resources, " CAFE\u0301  学习 ").id).toBe(
      "three",
    );
  });
  it.each([
    "",
    "/操作系统/进程",
    "操作系统/进程/",
    "操作系统/进程.ctn",
    "../进程",
  ])("rejects invalid logical paths: %s", (selector) => {
    expect(() => resolveNamedContent(resources, selector)).toThrow();
  });
  it("does not reinterpret stale names as aliases after rename, move or deletion", () => {
    const changed = [
      { ...resources[0]!, name: "线程", path: "基础/线程" },
      resources[2]!,
    ];
    expect(() => resolveNamedContent(changed, "操作系统/进程")).toThrow(
      "No exact target",
    );
    expect(resolveNamedContent(changed, "基础/线程").id).toBe("one");
  });
});
