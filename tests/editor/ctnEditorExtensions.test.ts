import { describe, expect, it } from "vitest";
import {
  createCtnIndentUnit,
  createCtnTabSizeExtension,
} from "../../src/editor/ctnEditorExtensions";

describe("ctn editor extensions", () => {
  it("stores editor indentation as tabs", () => {
    expect(createCtnIndentUnit()).toBe("\t");
  });

  it("creates configurable tab display width extensions", () => {
    expect(createCtnTabSizeExtension(2)).toBeDefined();
    expect(createCtnTabSizeExtension(4)).toBeDefined();
    expect(createCtnTabSizeExtension(6)).toBeDefined();
  });
});
