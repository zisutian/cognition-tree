import type { JournalViewModel } from "../../../application/journal";
import {
  defaultJournalSyntax,
  defaultJournalSyntaxSource,
} from "../../../core/journal/syntax/defaultJournalSyntax";

export function createJournalView(
  overrides: Partial<JournalViewModel> = {},
): JournalViewModel {
  return {
    activeEntry: {
      createdAt: "2026-01-02T03:04:05.000Z",
      id: "journal-entry-00000000-0000-4000-8000-000000000001",
      title: "2026-01-02-0001",
      updatedAt: "2026-01-02T03:05:00.000Z",
    },
    createEntry: () =>
      "journal-entry-00000000-0000-4000-8000-000000000002",
    deleteEntry: () => undefined,
    diagnostics: {
      diagnostics: [],
      errorCount: 0,
      status: "ready",
      warningCount: 0,
    },
    editor: {
      contentMode: { kind: "body", title: "2026-01-02-0001" },
      documentText: "",
      focusTarget: null,
      onActiveLineChange: () => undefined,
      onConsumeFocusTarget: () => undefined,
      readOnly: false,
      stats: { lineCount: 1, rootCount: 0, totalBlocks: 0 },
      syntax: defaultJournalSyntax,
      updateBody: () => undefined,
    },
    calendar: {
      toggle: () => undefined,
      years: [{
        expanded: true,
        key: "2026",
        label: "2026 年",
        months: [{
          entries: [{
            createdAt: "2026-01-02T03:04:05.000Z",
            id: "journal-entry-00000000-0000-4000-8000-000000000001",
            isActive: true,
            title: "2026-01-02-0001",
            updatedAt: "2026-01-02T03:05:00.000Z",
          }],
          expanded: true,
          key: "2026-01",
          label: "1 月",
        }],
      }],
    },
    navigation: {
      focusRequest: null,
      openEntryBlock: () => true,
      openEntryLine: () => undefined,
    },
    outline: {
      activeBlock: null,
      nodes: [],
      onSelectLine: () => undefined,
    },
    persistence: { status: "saved" },
    referenceNavigation: {
      navigate: () => undefined,
      resolve: () => [],
    },
    selectEntry: () => undefined,
    syntax: {
      syntax: defaultJournalSyntax,
      source: defaultJournalSyntaxSource,
      updateSource: () => undefined,
    },
    ...overrides,
  };
}
