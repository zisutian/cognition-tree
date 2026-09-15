import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  JournalEntryListItem,
  JournalViewModel,
} from "../../../application/journal/index.ts";
import {
  CtnDocumentDetailPanel,
  CtnEditor,
  CtnEditorPanel,
} from "../../editor/index.ts";
import { createClassNames, ListAction } from "../../ui/index.ts";
import journalStyles from "./journal.module.css";
const cx = createClassNames(journalStyles);

import {
  Button,
  CompactContextActionButtons,
  CompactContextList,
  CompactContextRow,
  EmptyState,
  Page,
  useFeedback,
  useReferenceNavigation,
} from "../../ui/index.ts";

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
  return (
    <Button
      aria-label="新建日记"
      disabled={!view.canMutate}
      onClick={() =>
        submitJournalEntryCreation({
          createEntry: view.createEntry,
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
  const feedback = useFeedback();
  const [pendingDelete, setPendingDelete] =
    useState<JournalEntryListItem | null>(null);

  useEffect(() => {
    if (pendingDelete && pendingDelete.id !== view.activeEntry?.id) {
      setPendingDelete(null);
    }
  }, [pendingDelete, view.activeEntry?.id]);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const deleted = feedback.runAction(() => {
      view.deleteEntry(pendingDelete.id);
      return true;
    });

    if (deleted === true) {
      setPendingDelete(null);
    }
  };

  return (
    <div className={cx("activity-context-content journal-context")}>
      {view.calendar.years.length > 0 ? (
        <div className={cx("journal-calendar-scroll")}>
          <CompactContextList
            aria-label="日记日历"
            className={cx("journal-calendar-tree")}
          >
            {view.calendar.years.map((year) => (
              <li className={cx("journal-calendar-branch")} key={year.key}>
                <ListAction
                  kind="context"
                  aria-expanded={year.expanded}
                  type="button"
                  onClick={() => view.calendar.toggle(`year:${year.key}`)}
                >
                  {year.expanded ? (
                    <ChevronDown aria-hidden="true" />
                  ) : (
                    <ChevronRight aria-hidden="true" />
                  )}
                  <span className={cx("ui-tree-text")}>{year.label}</span>
                </ListAction>
                {year.expanded ? (
                  <CompactContextList aria-label={`${year.label}日记`}>
                    {year.months.map((month) => (
                      <li
                        className={cx("journal-calendar-branch")}
                        key={month.key}
                      >
                        <ListAction
                          kind="context"
                          aria-expanded={month.expanded}
                          type="button"
                          onClick={() =>
                            view.calendar.toggle(`month:${month.key}`)
                          }
                        >
                          {month.expanded ? (
                            <ChevronDown aria-hidden="true" />
                          ) : (
                            <ChevronRight aria-hidden="true" />
                          )}
                          <span className={cx("ui-tree-text")}>
                            {month.label}
                          </span>
                        </ListAction>
                        {month.expanded ? (
                          <CompactContextList
                            aria-label={`${month.key}日记条目`}
                          >
                            {month.entries.map((entry) => (
                              <CompactContextRow
                                actions={
                                  entry.isActive ? (
                                    <CompactContextActionButtons
                                      actions={
                                        pendingDelete?.id === entry.id
                                          ? undefined
                                          : [
                                              {
                                                ariaLabel: `删除日记 ${entry.title}`,
                                                disabled: !view.canMutate,
                                                icon: Trash2,
                                                onSelect: () =>
                                                  setPendingDelete(entry),
                                                tone: "danger",
                                              },
                                            ]
                                      }
                                      confirmation={
                                        pendingDelete?.id === entry.id
                                          ? {
                                              tone: "danger",
                                              cancelAriaLabel: `取消删除日记 ${entry.title}`,
                                              disabled: !view.canMutate,
                                              confirmAriaLabel: `确认删除日记 ${entry.title}`,
                                              onCancel: () =>
                                                setPendingDelete(null),
                                              onConfirm: confirmDelete,
                                            }
                                          : undefined
                                      }
                                    />
                                  ) : undefined
                                }
                                className={cx(
                                  pendingDelete?.id === entry.id
                                    ? "is-delete-pending"
                                    : undefined,
                                )}
                                icon={<CalendarDays aria-hidden="true" />}
                                key={entry.id}
                                label={entry.title}
                                rowClassName="journal-entry-select"
                                selected={entry.isActive}
                                title={entry.title}
                                onSelect={() => view.selectEntry(entry.id)}
                              />
                            ))}
                          </CompactContextList>
                        ) : null}
                      </li>
                    ))}
                  </CompactContextList>
                ) : null}
              </li>
            ))}
          </CompactContextList>
        </div>
      ) : (
        <p className={cx("context-empty")}>没有日记。</p>
      )}
    </div>
  );
}

export function JournalEditorPanel({ view }: JournalViewProps & {}) {
  const feedback = useFeedback();
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
                  createEntry: view.createEntry,
                  runAction: feedback.runAction,
                })
              }
              type="button"
              variant="primary"
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
