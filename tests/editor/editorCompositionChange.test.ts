import { describe, expect, it, vi } from "vitest";
import { createEditorCompositionChange } from "../../src/editor/editorCompositionChange";

describe("editor composition change", () => {
  it("emits ordinary document changes immediately", () => {
    const onChange = vi.fn();
    const change = createEditorCompositionChange({ onChange });

    change.handleDocumentChange({
      isComposing: false,
      isExternal: false,
      value: "next",
    });

    expect(onChange).toHaveBeenCalledWith("next");
  });

  it("emits only the final composition value after composition ends", () => {
    const scheduled: Array<() => void> = [];
    const onChange = vi.fn();
    const change = createEditorCompositionChange({
      onChange,
      schedule: (callback) => scheduled.push(callback),
    });

    change.handleDocumentChange({
      isComposing: true,
      isExternal: false,
      value: "zh",
    });
    change.handleDocumentChange({
      isComposing: true,
      isExternal: false,
      value: "中文",
    });
    change.handleCompositionEnd(() => "中文");

    expect(onChange).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("中文");
  });

  it("deduplicates a final update that precedes the composition callback", () => {
    const scheduled: Array<() => void> = [];
    const onChange = vi.fn();
    const change = createEditorCompositionChange({
      onChange,
      schedule: (callback) => scheduled.push(callback),
    });

    change.handleDocumentChange({
      isComposing: true,
      isExternal: false,
      value: "中",
    });
    change.handleCompositionEnd(() => "中文");
    change.handleDocumentChange({
      isComposing: false,
      isExternal: false,
      value: "中文",
    });
    scheduled[0]?.();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("中文");
  });

  it("ignores external controlled-value synchronization", () => {
    const onChange = vi.fn();
    const change = createEditorCompositionChange({ onChange });

    change.handleDocumentChange({
      isComposing: false,
      isExternal: true,
      value: "external",
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
