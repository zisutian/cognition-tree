import {
  usePageNavigation,
  describePage,
  pageKey,
} from "../../navigation/index.ts";
import { Tree } from "compact-ui";
import { Button, EmptyState } from "compact-ui";
import { CalendarDays, Plus } from "lucide-react";
import type { JournalViewModel } from "../../../application/journal/index.ts";
import {
  CtnDocumentDetailPanel,
  CtnEditor,
  CtnEditorPanel,
} from "../../editor/index.ts";

import { Page, useFeedback, useReferenceNavigation } from "../../ui/index.ts";

type JournalViewProps = {
  view: JournalViewModel;
};

export function submitJournalEntryCreation({
  createEntry,
  runAction,
}: {
  createEntry: JournalViewModel["createEntry"];
  runAction: (action: () => void) => unknown;
}) {
  return runAction(() => {
    createEntry();
  });
}

export function JournalContextActions({ view }: JournalViewProps) {
  const feedback = useFeedback();
  const pages = usePageNavigation();
  return (
    <Button
      aria-label="新建日记"
      disabled={!view.canMutate}
      onClick={() =>
        submitJournalEntryCreation({
          createEntry: () => pages.created("journal", view.createEntry),
          runAction: feedback.runAction,
        })
      }
      title="新建日记"
      type="button"
      variant="icon"
    >
      <Plus aria-hidden="true" size={14} />
    </Button>
  );
}

export function JournalContext({ view }: JournalViewProps) {
  const feedback = useFeedback(),
    pages = usePageNavigation();
  const expanded = new Set<string>();
  const nodes = view.calendar.years.map((year) => {
    if (year.expanded) expanded.add(`year:${year.key}`);
    return {
      id: `year:${year.key}`,
      label: year.label,
      canHaveChildren: true,
      children: year.months.map((month) => {
        if (month.expanded) expanded.add(`month:${month.key}`);
        return {
          id: `month:${month.key}`,
          label: month.label,
          canHaveChildren: true,
          children: month.entries.map((entry) => ({
            id: entry.id,
            label: entry.title,
            icon: <CalendarDays />,
          })),
        };
      }),
    };
  });
  return (
    <Tree
      label="日记日历"
      nodes={nodes}
      selectedId={view.activeEntry?.id ?? null}
      expandedIds={expanded}
      onExpandedChange={(next) => {
        for (const node of nodes) {
          if (expanded.has(node.id) !== next.has(node.id))
            view.calendar.toggle(node.id);
          for (const month of node.children)
            if (expanded.has(month.id) !== next.has(month.id))
              view.calendar.toggle(month.id);
        }
      }}
      onSelect={() => {}}
      onOpen={(id, intent) => {
        const entry = view.calendar.years
          .flatMap((y) => y.months.flatMap((m) => m.entries))
          .find((e) => e.id === id);
        if (entry)
          pages.open(
            describePage("journal", "journal-entry", id, entry.title),
            intent,
            () => view.selectEntry(entry.id),
          );
      }}
      capabilities={{
        delete: (node) => view.canMutate && !node.canHaveChildren,
      }}
      onDelete={(id) => {
        const entry = view.calendar.years
          .flatMap((y) => y.months.flatMap((m) => m.entries))
          .find((e) => e.id === id);
        if (entry) view.deleteEntry(entry.id);
      }}
      onActionError={feedback.notifyError}
    />
  );
}

export function JournalEditorPanel({ view }: JournalViewProps & {}) {
  const feedback = useFeedback();
  const pages = usePageNavigation();
  const referenceNavigation = useReferenceNavigation(view.referenceNavigation);

  if (!view.activeEntry) {
    return (
      <Page aria-label="日记编辑" kind="editor">
        <EmptyState
          action={
            <Button
              disabled={!view.canMutate}
              onClick={() =>
                submitJournalEntryCreation({
                  createEntry: () => pages.created("journal", view.createEntry),
                  runAction: feedback.runAction,
                })
              }
              type="button"
              variant="normal"
            >
              新建日记
            </Button>
          }
          title="还没有日记"
        />
      </Page>
    );
  }

  return (
    <CtnEditorPanel ariaLabel="日记编辑">
      <CtnEditor
        key={view.activeEntry.id}
        sessionKey={pageKey(
          describePage(
            "journal",
            "journal-entry",
            view.activeEntry.id,
            view.activeEntry.title,
          ).target,
        )}
        contentMode={view.editor.contentMode}
        focusTarget={view.editor.focusTarget}
        syntax={view.editor.syntax}
        value={view.editor.documentText}
        onActiveLineChange={view.editor.onActiveLineChange}
        onChange={view.editor.updateBody}
        onConsumeFocusTarget={view.editor.onConsumeFocusTarget}
        onOpenReference={referenceNavigation.openReference}
        readOnly={view.editor.readOnly}
      />
      {referenceNavigation.picker}
    </CtnEditorPanel>
  );
}

export function JournalDetailPanel({ view }: JournalViewProps) {
  if (!view.activeEntry) {
    return null;
  }

  const selectedBlock = view.outline.activeBlock;
  const selectedLineNumbers = selectedBlock
    ? new Set([selectedBlock.lineNumber])
    : undefined;

  return (
    <CtnDocumentDetailPanel
      blockMetadata={selectedBlock?.metadata ?? null}
      documentLabel="日记"
      documentMetadata={view.activeEntry}
      stats={view.editor.stats}
      structure={{
        indentUnitCount: view.editor.syntax.tabDisplayWidth,
        nodes: view.outline.nodes,
        onSelectLine: view.outline.onSelectLine,
        selectedLineNumbers,
      }}
    />
  );
}
