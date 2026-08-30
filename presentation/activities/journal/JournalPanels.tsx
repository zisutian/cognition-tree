import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  JournalEntryListItem,
  JournalViewModel,
} from "../../../application/journal";
import { CtnEditor } from "../../editor/CtnEditor";
import { CtnDocumentDetailPanel } from "../../editor/CtnDocumentDetailPanel";
import { CtnEditorPanel } from "../../editor/CtnEditorPanel";
import {
  CompactContextList,
  CompactContextActionButtons,
  CompactContextRow,
} from "../../ui/shared/CompactContextList";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  Button,
  EmptyState,
  Panel,
} from "../../ui/shared/primitives";
import { useReferenceNavigation } from "../../ui/shared/useReferenceNavigation";

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
    <div className="activity-context-content journal-context">
      <div className="context-toolbar">
        <Button
          aria-label="新建日记"
          onClick={() => submitJournalEntryCreation({
            createEntry: view.createEntry,
            runAction: feedback.runAction,
          })}
          title="新建日记"
          type="button"
          variant="icon"
        >
          <Plus aria-hidden="true" size={14} />
        </Button>
      </div>
      {view.calendar.years.length > 0 ? (
        <div className="journal-calendar-scroll">
          <CompactContextList
            aria-label="日记日历"
            className="journal-calendar-tree"
          >
            {view.calendar.years.map((year) => (
              <li className="journal-calendar-branch" key={year.key}>
                <Button
                  aria-expanded={year.expanded}
                  className="ui-tree-row ui-compact-context-row journal-calendar-toggle"
                  type="button"
                  variant="bare"
                  onClick={() => view.calendar.toggle(`year:${year.key}`)}
                >
                  {year.expanded
                    ? <ChevronDown aria-hidden="true" />
                    : <ChevronRight aria-hidden="true" />}
                  <span className="ui-tree-text">{year.label}</span>
                </Button>
                {year.expanded ? (
                  <CompactContextList aria-label={`${year.label}日记`}>
                    {year.months.map((month) => (
                      <li className="journal-calendar-branch" key={month.key}>
                        <Button
                          aria-expanded={month.expanded}
                          className="ui-tree-row ui-compact-context-row journal-calendar-toggle"
                          type="button"
                          variant="bare"
                          onClick={() =>
                            view.calendar.toggle(`month:${month.key}`)}
                        >
                          {month.expanded
                            ? <ChevronDown aria-hidden="true" />
                            : <ChevronRight aria-hidden="true" />}
                          <span className="ui-tree-text">{month.label}</span>
                        </Button>
                        {month.expanded ? (
                          <CompactContextList
                            aria-label={`${month.key}日记条目`}
                          >
                            {month.entries.map((entry) => (
                              <CompactContextRow
                                actions={entry.isActive ? (
                                  <CompactContextActionButtons
                                    actions={pendingDelete?.id === entry.id
                                      ? undefined
                                      : [{
                                          ariaLabel: `删除日记 ${entry.title}`,
                                          label: "删",
                                          onSelect: () => setPendingDelete(entry),
                                          tone: "danger",
                                        }]}
                                    confirmation={pendingDelete?.id === entry.id
                                      ? {
                                          cancelAriaLabel: `取消删除日记 ${entry.title}`,
                                          confirmAriaLabel: `确认删除日记 ${entry.title}`,
                                          onCancel: () => setPendingDelete(null),
                                          onConfirm: confirmDelete,
                                        }
                                      : undefined}
                                  />
                                ) : undefined}
                                className={pendingDelete?.id === entry.id
                                  ? "is-delete-pending"
                                  : undefined}
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
        <p className="context-empty">没有日记。</p>
      )}
    </div>
  );
}

export function JournalEditorPanel({
  focusMode,
  onToggleFocusMode,
  view,
}: JournalViewProps & {
  focusMode: boolean;
  onToggleFocusMode: () => void;
}) {
  const feedback = useFeedback();
  const referenceNavigation = useReferenceNavigation(view.referenceNavigation);

  if (!view.activeEntry) {
    return (
      <Panel aria-label="日记编辑" className="ctn-editor-panel">
        <EmptyState
          action={
            <Button
              onClick={() => submitJournalEntryCreation({
                createEntry: view.createEntry,
                runAction: feedback.runAction,
              })}
              type="button"
              variant="primary"
            >
              新建日记
            </Button>
          }
          description="手动创建后即可在这里记录正文。"
          title="还没有日记"
        />
      </Panel>
    );
  }

  return (
    <CtnEditorPanel
      ariaLabel="日记编辑"
      focusMode={focusMode}
      onToggleFocusMode={onToggleFocusMode}
      title={view.activeEntry.title}
    >
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

export function JournalDetailPanel({
  onCollapseDetail,
  view,
}: JournalViewProps & { onCollapseDetail: () => void }) {
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
      onCollapseDetail={onCollapseDetail}
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
