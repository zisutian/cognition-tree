// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { createNotesTitleEditSession } from
  "../../../../../../presentation/activities/notes/edit/notesTitleEditSession";

function createHarness(initialSource: string, titleLineNumber = 1) {
  const notify = vi.fn();
  const onDraftChange = vi.fn();
  const synchronize = vi.fn();
  const submit = vi.fn((change: { source: string }) => ({
    authoritativeSource: change.source,
    titleNormalized: false,
  }));
  const session = createNotesTitleEditSession({
    initialSource,
    notify,
    onDraftChange,
    submit,
    synchronize,
    titleLineNumber,
  });

  return { notify, onDraftChange, session, submit, synchronize };
}

describe("notes title edit session", () => {
  it.each([
    { initial: "旧标题\n正文", line: 1, draft: "\n正文" },
    {
      initial: "@ctn-block id=title\n旧标题\n正文",
      line: 2,
      draft: "@ctn-block id=title\n\n正文",
    },
  ])("allows a completely empty title while editing line $line", ({
    draft,
    initial,
    line,
  }) => {
    const harness = createHarness(initial, line);

    harness.session.onChange({ edits: [], source: draft });

    expect(harness.submit).not.toHaveBeenCalled();
    expect(harness.onDraftChange).toHaveBeenLastCalledWith(draft);
    harness.session.onActiveLineChange(line + 1, draft);
    expect(harness.synchronize).toHaveBeenLastCalledWith(initial);
    expect(harness.notify).toHaveBeenCalledWith(
      "笔记标题不能为空，已恢复原标题。",
    );
  });

  it("submits the final title once after successive deletion and replacement", () => {
    const harness = createHarness("旧标题\n正文");

    for (const source of ["旧标\n正文", "\n正文", "新\n正文", "新标题\n正文"]) {
      harness.session.onChange({ edits: [], source });
    }
    expect(harness.submit).not.toHaveBeenCalled();
    harness.session.onActiveLineChange(2, "新标题\n正文");
    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]?.[0].source).toBe("新标题\n正文");
    harness.session.onBlur("新标题\n正文");
    expect(harness.submit).toHaveBeenCalledTimes(1);
  });

  it("cancels the title draft when undo returns to the original title", () => {
    const harness = createHarness("旧标题\n正文");

    harness.session.onChange({ edits: [], source: "\n正文" });
    harness.session.onChange({ edits: [], source: "新标题\n正文" });
    harness.session.onChange({ edits: [], source: "旧标题\n正文" });
    harness.session.onBlur("旧标题\n正文");

    expect(harness.submit).not.toHaveBeenCalled();
    expect(harness.synchronize).toHaveBeenLastCalledWith("旧标题\n正文");
  });

  it("does not resubmit a normalized title during a second blur", () => {
    const harness = createHarness("旧标题\n正文");

    harness.submit.mockImplementation((change) => ({
      authoritativeSource: change.source.replace("  新标题  ", "新标题"),
      titleNormalized: true,
    }));
    harness.session.onChange({ edits: [], source: "  新标题  \n正文" });
    harness.session.onBlur("  新标题  \n正文");
    harness.session.onBlur("  新标题  \n正文");

    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.synchronize).toHaveBeenLastCalledWith("新标题\n正文");
  });

  it("keeps body changes when an empty title is rolled back", () => {
    const harness = createHarness("旧标题\n正文");

    harness.session.onChange({ edits: [], source: "\n正文已修改" });

    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]?.[0].source).toBe(
      "旧标题\n正文已修改",
    );
    harness.session.onBlur("\n正文已修改");
    expect(harness.synchronize).toHaveBeenLastCalledWith(
      "旧标题\n正文已修改",
    );
  });

  it("restores the old title after a rejected rename without losing the body", () => {
    const harness = createHarness("旧标题\n正文");

    harness.submit.mockImplementation((change) =>
      change.source.startsWith("重复标题\n")
        ? undefined as never
        : { authoritativeSource: change.source, titleNormalized: false }
    );
    harness.session.onChange({ edits: [], source: "重复标题\n正文已修改" });
    harness.session.onBlur("重复标题\n正文已修改");
    harness.session.onBlur("重复标题\n正文已修改");

    expect(harness.submit.mock.calls.map(([change]) => change.source)).toEqual([
      "旧标题\n正文已修改",
      "重复标题\n正文已修改",
    ]);
    expect(harness.synchronize).toHaveBeenLastCalledWith(
      "旧标题\n正文已修改",
    );
  });

  it("waits for composition input before committing after leaving the title", () => {
    const harness = createHarness("旧标题\n正文");

    harness.session.onActiveLineChange(2, "中文标\n正文", true);
    expect(harness.submit).not.toHaveBeenCalled();
    harness.session.onChange({ edits: [], source: "中文标题\n正文" });

    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]?.[0].source).toBe("中文标题\n正文");
  });

  it("waits for composition input before committing after blur", () => {
    const harness = createHarness("旧标题\n正文");

    harness.session.onBlur("中文标\n正文", true);
    expect(harness.submit).not.toHaveBeenCalled();
    harness.session.onChange({ edits: [], source: "中文标题\n正文" });

    expect(harness.submit).toHaveBeenCalledTimes(1);
    expect(harness.submit.mock.calls[0]?.[0].source).toBe("中文标题\n正文");
  });
});
