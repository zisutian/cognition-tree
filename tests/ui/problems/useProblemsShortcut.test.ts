import { describe, expect, it } from "vitest";
import {
  isWorkbenchProblemsShortcut,
  shouldHandleWorkbenchProblemsShortcut,
} from "../../../src/ui/problems/useProblemsShortcut";

function createKeys(overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    ctrlKey: true,
    key: "m",
    metaKey: false,
    shiftKey: true,
    ...overrides,
  } as KeyboardEvent;
}

describe("workbench problems shortcut", () => {
  it("recognizes only Ctrl+Shift+M", () => {
    expect(isWorkbenchProblemsShortcut(createKeys())).toBe(true);
    expect(isWorkbenchProblemsShortcut(createKeys({ key: "M" }))).toBe(true);
    expect(isWorkbenchProblemsShortcut(createKeys({ shiftKey: false }))).toBe(false);
    expect(isWorkbenchProblemsShortcut(createKeys({ altKey: true }))).toBe(false);
    expect(isWorkbenchProblemsShortcut(createKeys({ metaKey: true }))).toBe(false);
  });

  it("does not handle the shortcut while the problems panel is unavailable", () => {
    expect(shouldHandleWorkbenchProblemsShortcut(true, createKeys())).toBe(true);
    expect(shouldHandleWorkbenchProblemsShortcut(false, createKeys())).toBe(false);
  });
});
