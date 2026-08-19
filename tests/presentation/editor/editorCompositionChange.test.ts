import { ChangeSet, type ChangeSpec } from "@codemirror/state";
import { describe, expect, it, vi } from "vitest";
import { createEditorCompositionChange } from "../../../presentation/editor/editorCompositionChange";

function documentChange({
  changes,
  isComposing = false,
  isExternal = false,
  previousSource,
  source,
}: {
  changes: ChangeSpec;
  isComposing?: boolean;
  isExternal?: boolean;
  previousSource: string;
  source: string;
}) {
  return {
    changes: ChangeSet.of(changes, previousSource.length),
    isComposing,
    isExternal,
    source,
  };
}

describe("editor composition change", () => {
  it("emits ordinary document edits in previous-source coordinates", () => {
    const onChange = vi.fn();
    const change = createEditorCompositionChange({ onChange });

    change.handleDocumentChange(
      documentChange({
        changes: [
          { from: 0, insert: "A", to: 1 },
          { from: 3, insert: "D", to: 4 },
        ],
        previousSource: "abcd",
        source: "AbcD",
      }),
    );

    expect(onChange).toHaveBeenCalledWith({
      edits: [
        { from: 0, insertedText: "A", to: 1 },
        { from: 3, insertedText: "D", to: 4 },
      ],
      source: "AbcD",
    });
  });

  it("composes IME ChangeSets and emits only the final source", () => {
    const scheduled: Array<() => void> = [];
    const onChange = vi.fn();
    const change = createEditorCompositionChange({
      onChange,
      schedule: (callback) => scheduled.push(callback),
    });

    change.handleDocumentChange(
      documentChange({
        changes: { from: 0, insert: "zh" },
        isComposing: true,
        previousSource: "",
        source: "zh",
      }),
    );
    change.handleDocumentChange(
      documentChange({
        changes: { from: 0, insert: "中文", to: 2 },
        isComposing: true,
        previousSource: "zh",
        source: "中文",
      }),
    );
    change.handleCompositionEnd(() => "中文");

    expect(onChange).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      edits: [{ from: 0, insertedText: "中文", to: 0 }],
      source: "中文",
    });
  });

  it("folds a final non-composing update into the pending IME ChangeSet", () => {
    const scheduled: Array<() => void> = [];
    const onChange = vi.fn();
    const change = createEditorCompositionChange({
      onChange,
      schedule: (callback) => scheduled.push(callback),
    });

    change.handleDocumentChange(
      documentChange({
        changes: { from: 0, insert: "中" },
        isComposing: true,
        previousSource: "",
        source: "中",
      }),
    );
    change.handleCompositionEnd(() => "中文");
    change.handleDocumentChange(
      documentChange({
        changes: { from: 1, insert: "文" },
        previousSource: "中",
        source: "中文",
      }),
    );
    scheduled[0]?.();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      edits: [{ from: 0, insertedText: "中文", to: 0 }],
      source: "中文",
    });
  });

  it("ignores external synchronization and resets the emitted baseline", () => {
    const onChange = vi.fn();
    const change = createEditorCompositionChange({ onChange });

    change.handleDocumentChange(
      documentChange({
        changes: { from: 0, insert: "a" },
        previousSource: "",
        source: "a",
      }),
    );
    change.handleDocumentChange(
      documentChange({
        changes: { from: 0, to: 1 },
        isExternal: true,
        previousSource: "a",
        source: "",
      }),
    );
    change.handleDocumentChange(
      documentChange({
        changes: { from: 0, insert: "a" },
        previousSource: "",
        source: "a",
      }),
    );

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, {
      edits: [{ from: 0, insertedText: "a", to: 0 }],
      source: "a",
    });
    expect(onChange).toHaveBeenNthCalledWith(2, {
      edits: [{ from: 0, insertedText: "a", to: 0 }],
      source: "a",
    });
  });

  it("cancels a queued composition emission after external synchronization", () => {
    const scheduled: Array<() => void> = [];
    const onChange = vi.fn();
    const change = createEditorCompositionChange({
      onChange,
      schedule: (callback) => scheduled.push(callback),
    });

    change.handleDocumentChange(
      documentChange({
        changes: { from: 0, insert: "stale" },
        isComposing: true,
        previousSource: "",
        source: "stale",
      }),
    );
    change.handleCompositionEnd(() => "stale");
    change.handleDocumentChange(
      documentChange({
        changes: { from: 0, insert: "canonical", to: 5 },
        isExternal: true,
        previousSource: "stale",
        source: "canonical",
      }),
    );
    scheduled[0]?.();

    expect(onChange).not.toHaveBeenCalled();
  });
});
