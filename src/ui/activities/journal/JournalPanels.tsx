import {
  CalendarDays,
  ChevronRight,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type {
  JournalEntryListItem,
  JournalViewModel,
} from "../../../application/journal";
import { CtnEditor } from "../../../editor/CtnEditor";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import {
  Button,
  cx,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../shared/primitives";
import { StructureTree } from "../../shared/tree";
import { useReferenceNavigation } from "../../shared/useReferenceNavigation";

type JournalViewProps = {
  view: JournalViewModel;
};

export function JournalDeleteConfirmation({
  pendingEntry,
  onCancel,
  onDelete,
}: {
  pendingEntry: JournalEntryListItem | null;
  onCancel: () => void;
  onDelete: (entryId: JournalEntryListItem["id"]) => void;
}) {
  return (
    <ConfirmDialog
      confirmLabel="删除日记"
      description={pendingEntry
        ? `将永久删除日记“${pendingEntry.title}”。`
        : ""}
      open={pendingEntry !== null}
      title="删除日记"
      onCancel={onCancel}
      onConfirm={() => {
        if (pendingEntry) {
          onDelete(pendingEntry.id);
        }
        onCancel();
      }}
    />
  );
}

const timestampFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  year: "numeric",
});

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? timestamp
    : timestampFormatter.format(date);
}

function persistenceLabel(view: JournalViewModel) {
  switch (view.persistence.status) {
    case "saved":
      return "已保存";
    case "saving-local":
      return "正在保存";
    case "pending-sync":
      return "等待同步";
    case "syncing":
      return "正在同步";
    case "offline":
      return "离线";
    case "conflict":
      return "同步冲突";
    case "error":
      return "保存失败";
  }
}

export function JournalContext({ view }: JournalViewProps) {
  const [pendingDelete, setPendingDelete] =
    useState<JournalEntryListItem | null>(null);

  return (
    <div className="activity-context-content journal-context">
      <div className="context-toolbar">
        <Button
          aria-label="新建日记"
          onClick={view.createEntry}
          title="新建日记"
          type="button"
          variant="icon"
        >
          <Plus aria-hidden="true" size={14} />
        </Button>
      </div>
      {view.groups.length > 0 ? (
        <div className="journal-month-groups">
          {view.groups.map((group) => (
            <section aria-labelledby={`journal-month-${group.key}`} key={group.key}>
              <h3 id={`journal-month-${group.key}`}>{group.label}</h3>
              <ul aria-label={`${group.label}日记`} className="ui-tree">
                {group.entries.map((entry) => (
                  <li
                    className={cx(
                      "ui-tree-row-frame journal-entry-row",
                      entry.isActive && "is-selected",
                    )}
                    key={entry.id}
                  >
                    <button
                      aria-current={entry.isActive ? "page" : undefined}
                      className={cx(
                        "ui-tree-row journal-entry-select",
                        entry.isActive && "is-selected",
                      )}
                      onClick={() => view.selectEntry(entry.id)}
                      title={entry.title}
                      type="button"
                    >
                      <CalendarDays aria-hidden="true" />
                      <span className="ui-tree-text">{entry.title}</span>
                    </button>
                    <span className="ui-tree-actions">
                      <button
                        aria-label={`删除日记 ${entry.title}`}
                        onClick={() => setPendingDelete(entry)}
                        title="删除日记"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={13} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="context-empty">没有日记。</p>
      )}
      <JournalDeleteConfirmation
        pendingEntry={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onDelete={view.deleteEntry}
      />
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
  const referenceNavigation = useReferenceNavigation(view.referenceNavigation);

  if (!view.activeEntry) {
    return (
      <Panel aria-label="日记编辑" className="journal-editor-panel">
        <EmptyState
          action={
            <Button
              onClick={view.createEntry}
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
    <Panel aria-label="日记编辑" className="journal-editor-panel">
      <PanelHeader
        actions={
          <>
            {view.editor.errorMessage ? (
              <span className="ui-error">{view.editor.errorMessage}</span>
            ) : (
              <span className="journal-persistence-state">
                {persistenceLabel(view)}
              </span>
            )}
            <Button
              aria-label={focusMode ? "退出专注模式" : "进入专注模式"}
              onClick={onToggleFocusMode}
              title={focusMode ? "退出专注模式" : "进入专注模式"}
              type="button"
              variant="icon"
            >
              {focusMode ? (
                <Minimize2 aria-hidden="true" size={14} />
              ) : (
                <Maximize2 aria-hidden="true" size={14} />
              )}
            </Button>
          </>
        }
        title={view.activeEntry.title}
      />
      <CtnEditor
        key={view.activeEntry.id}
        contentMode={view.editor.contentMode}
        focusTarget={view.editor.focusTarget}
        syntaxProfile={view.editor.syntaxProfile}
        value={view.editor.documentText}
        onActiveLineChange={view.editor.onActiveLineChange}
        onChange={view.editor.updateBody}
        onConsumeFocusTarget={view.editor.onConsumeFocusTarget}
        onOpenReference={referenceNavigation.openReference}
      />
      {referenceNavigation.picker}
    </Panel>
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
    <Panel aria-label="日记详情" className="journal-detail-panel" tone="detail">
      <PanelHeader
        actions={
          <Button
            aria-label="收回右侧详情"
            onClick={onCollapseDetail}
            title="收回右侧详情"
            type="button"
            variant="icon"
          >
            <ChevronRight aria-hidden="true" size={13} />
          </Button>
        }
        title="结构"
      />
      <PanelBody className="detail-panel-stack" scroll>
        <dl aria-label="日记统计" className="detail-summary-strip">
          <div><dd>{view.editor.stats.lineCount}</dd><dt>行</dt></div>
          <div><dd>{view.editor.stats.totalBlocks}</dd><dt>块</dt></div>
          <div><dd>{view.editor.stats.rootCount}</dd><dt>根</dt></div>
        </dl>
        <dl aria-label="日记时间" className="journal-time-details">
          <div>
            <dt>创建</dt>
            <dd>
              <time dateTime={view.activeEntry.createdAt}>
                {formatTimestamp(view.activeEntry.createdAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>修改</dt>
            <dd>
              <time dateTime={view.activeEntry.updatedAt}>
                {formatTimestamp(view.activeEntry.updatedAt)}
              </time>
            </dd>
          </div>
          {selectedBlock ? (
            <>
              <div>
                <dt>当前块创建</dt>
                <dd>
                  <time dateTime={selectedBlock.metadata.createdAt}>
                    {formatTimestamp(selectedBlock.metadata.createdAt)}
                  </time>
                </dd>
              </div>
              <div>
                <dt>当前块更新</dt>
                <dd>
                  <time dateTime={selectedBlock.metadata.updatedAt}>
                    {formatTimestamp(selectedBlock.metadata.updatedAt)}
                  </time>
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        {view.outline.nodes.length > 0 ? (
          <StructureTree
            indentUnitCount={view.editor.syntaxProfile.tabDisplayWidth}
            nodes={view.outline.nodes}
            selectedLineNumbers={selectedLineNumbers}
            onSelectLine={view.outline.onSelectLine}
          />
        ) : (
          <p className="ui-muted">没有可解析结构。</p>
        )}
      </PanelBody>
    </Panel>
  );
}
