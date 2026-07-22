import type {
  ComponentProps,
  ReactElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../../../src/ui/shared/ConfirmDialog";
import {
  JournalContext,
  JournalDeleteConfirmation,
  JournalDetailPanel,
  JournalEditorPanel,
  submitJournalEntryCreation,
} from "../../../src/ui/activities/journal/JournalPanels";
import { createView } from "../viewFactory";
import { runFeedbackAction } from "../../../src/ui/shared/FeedbackProvider";

const olderJanuaryEntry = {
  createdAt: "2026-01-02T02:04:05.000Z",
  id: "journal-entry-00000000-0000-4000-8000-000000000002" as const,
  isActive: false,
  title: "2026-01-02-0002",
  updatedAt: "2026-01-02T02:04:05.000Z",
};

const decemberEntry = {
  createdAt: "2025-12-31T15:04:05.000Z",
  id: "journal-entry-00000000-0000-4000-8000-000000000003" as const,
  isActive: false,
  title: "2025-12-31-0001",
  updatedAt: "2025-12-31T15:04:05.000Z",
};

describe("Journal panels", () => {
  it("reports the daily creation limit through Feedback", () => {
    const error = new Error(
      "Journal date 2026-07-18 has reached the daily limit of 9999 entries.",
    );
    const createEntry = vi.fn(() => {
      throw error;
    });
    const notifyError = vi.fn();

    submitJournalEntryCreation({
      createEntry,
      runAction: (action) => runFeedbackAction(action, notifyError),
    });

    expect(createEntry).toHaveBeenCalledOnce();
    expect(notifyError).toHaveBeenCalledWith(error);
  });

  it("renders month groups and entries in the view-model order", () => {
    const base = createView().journal;
    const activeEntry = base.groups[0].entries[0];
    const view = {
      ...base,
      groups: [
        {
          entries: [activeEntry, olderJanuaryEntry],
          key: "2026-01",
          label: "2026 年 1 月",
        },
        {
          entries: [decemberEntry],
          key: "2025-12",
          label: "2025 年 12 月",
        },
      ],
    };
    const markup = renderToStaticMarkup(<JournalContext view={view} />);

    expect(markup.indexOf("2026 年 1 月")).toBeLessThan(
      markup.indexOf("2025 年 12 月"),
    );
    expect(markup.indexOf(activeEntry.title)).toBeLessThan(
      markup.indexOf(olderJanuaryEntry.title),
    );
    expect(markup).toContain("ui-compact-context-group-title");
    expect(markup).toContain("ui-compact-context-row-frame");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain(`aria-label="删除日记 ${activeEntry.title}"`);
  });

  it("shows the derived title as fixed text and edits only Journal body mode", () => {
    const view = createView().journal;
    const contextMarkup = renderToStaticMarkup(<JournalContext view={view} />);
    const editorMarkup = renderToStaticMarkup(
      <JournalEditorPanel
        focusMode={false}
        view={view}
        onToggleFocusMode={() => undefined}
      />,
    );

    expect(contextMarkup).not.toContain("重命名");
    expect(contextMarkup).not.toContain("<input");
    expect(editorMarkup).toContain(view.activeEntry?.title);
    expect(editorMarkup).toContain('data-editor-mode="body"');
    expect(editorMarkup).not.toContain('aria-label="重命名日记"');
  });

  it("requires an explicit confirmation before deleting an entry", () => {
    const entry = createView().journal.groups[0].entries[0];
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const confirmation = JournalDeleteConfirmation({
      pendingEntry: entry,
      onCancel,
      onDelete,
    }) as ReactElement<
      ComponentProps<typeof ConfirmDialog>,
      typeof ConfirmDialog
    >;
    const markup = renderToStaticMarkup(confirmation);

    expect(confirmation.type).toBe(ConfirmDialog);
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain(`将永久删除日记“${entry.title}”。`);
    expect(markup).toContain("删除日记");
    expect(onDelete).not.toHaveBeenCalled();

    confirmation.props.onConfirm();

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(entry.id);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows the selected body block timestamps with the entry structure", () => {
    const base = createView().journal;
    const view = {
      ...base,
      outline: {
        ...base.outline,
        activeBlock: {
          children: [],
          endLineNumber: 1,
          hasDiagnostics: false,
          id: "journal-block-1",
          label: "概念",
          lineLabel: "L1",
          lineNumber: 1,
          metadata: {
            createdAt: "2026-01-02T03:04:06.000Z",
            id: "00000000-0000-4000-8000-000000000010",
            indentText: "",
            updatedAt: "2026-01-02T03:05:06.000Z",
          },
          textDisplay: {
            displayText: "正文",
            segments: [{ id: "text", kind: "text" as const, text: "正文" }],
            textColor: "default" as const,
          },
        },
      },
    };
    const markup = renderToStaticMarkup(
      <JournalDetailPanel
        onCollapseDetail={() => undefined}
        view={view}
      />,
    );

    expect(markup).toContain("当前块创建");
    expect(markup).toContain("当前块更新");
    expect(markup).toContain('dateTime="2026-01-02T03:04:06.000Z"');
    expect(markup).toContain('dateTime="2026-01-02T03:05:06.000Z"');
  });
});
