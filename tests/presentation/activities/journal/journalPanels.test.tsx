import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  JournalContext,
  JournalDetailPanel,
  JournalEditorPanel,
  submitJournalEntryCreation,
} from "../../../../presentation/activities/journal/JournalPanels";
import { createJournalView } from "../../fixtures/journalViewFixture";
import { runFeedbackAction } from "../../../../presentation/ui/shared/FeedbackProvider";
import { expectMarkupSemantics } from "../../markupSemantics";

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

  it("renders the expanded calendar tree and entries in view-model order", () => {
    const base = createJournalView();
    const activeEntry = base.calendar.years[0].months[0].entries[0];
    const view = {
      ...base,
      calendar: {
        ...base.calendar,
        years: [
          {
            expanded: true,
            key: "2026",
            label: "2026 年",
            months: [{
              entries: [activeEntry, olderJanuaryEntry],
              expanded: true,
              key: "2026-01",
              label: "1 月",
            }],
          },
          {
            expanded: true,
            key: "2025",
            label: "2025 年",
            months: [{
              entries: [decemberEntry],
              expanded: true,
              key: "2025-12",
              label: "12 月",
            }],
          },
        ],
      },
    };
    const markup = renderToStaticMarkup(<JournalContext view={view} />);

    expectMarkupSemantics(markup, {
      has: [
        'aria-current="page"', `aria-label="删除日记 ${activeEntry.title}"`,
        ">删<",
      ],
      lacks: ["2 日", "31 日", 'role="alertdialog"'],
      ordered: [
        "2026 年", activeEntry.title, olderJanuaryEntry.title, "2025 年",
      ],
    });
  });

  it("shows the derived title as fixed text and edits only Journal body mode", () => {
    const view = createJournalView();
    const contextMarkup = renderToStaticMarkup(<JournalContext view={view} />);
    const editorMarkup = renderToStaticMarkup(
      <JournalEditorPanel
        focusMode={false}
        view={view}
        onToggleFocusMode={() => undefined}
      />,
    );

    expectMarkupSemantics(contextMarkup, {
      lacks: ["重命名", "<input"],
    });
    expectMarkupSemantics(editorMarkup, {
      has: [view.activeEntry!.title, 'data-editor-mode="body"'],
      lacks: ['aria-label="重命名日记"'],
    });
  });

  it("shows the selected body block timestamps with the entry structure", () => {
    const base = createJournalView();
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

    expectMarkupSemantics(markup, {
      has: [
        "当前块创建", "当前块更新",
        'dateTime="2026-01-02T03:04:06.000Z"',
        'dateTime="2026-01-02T03:05:06.000Z"',
      ],
    });
  });
});
