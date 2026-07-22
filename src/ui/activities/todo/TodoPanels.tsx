// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ChevronRight,
  GripVertical,
  ListChecks,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useState,
  type DragEvent,
} from "react";
import type {
  TodoBlockView,
  TodoCollectionListItem,
  TodoViewModel,
} from "../../../application/todo";
import { CtnEditor } from "../../../editor/CtnEditor";
import {
  CompactContextGroup,
  CompactContextRow,
} from "../../shared/CompactContextList";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import { useFeedback } from "../../shared/FeedbackProvider";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  cx,
} from "../../shared/primitives";

type TodoViewProps = { view: TodoViewModel };
type CollectionDraft = { id: TodoCollectionListItem["id"]; value: string };

const collectionDragType = "application/x-cognition-tree-todo-collection";
const blockDragType = "application/x-cognition-tree-todo-block";

export function createTodoInlineEditBlurGuard() {
  let ignoreNextBlur = false;

  return {
    begin() {
      ignoreNextBlur = false;
    },
    cancel() {
      ignoreNextBlur = true;
    },
    onBlur(submit: () => void) {
      if (ignoreNextBlur) {
        ignoreNextBlur = false;
      } else {
        submit();
      }
    },
    submit() {
      ignoreNextBlur = true;
    },
  };
}

function persistenceLabel(view: TodoViewModel) {
  switch (view.persistence.status) {
    case "saved": return "已保存";
    case "saving-local": return "正在保存";
    case "pending-sync": return "等待同步";
    case "syncing": return "正在同步";
    case "offline": return "离线";
    case "conflict": return "同步冲突";
    case "error": return "保存失败";
  }
}

export function TodoCollectionDeleteConfirmation({
  pendingCollection,
  onCancel,
  onDelete,
}: {
  pendingCollection: TodoCollectionListItem | null;
  onCancel: () => void;
  onDelete: (collectionId: TodoCollectionListItem["id"]) => void;
}) {
  return (
    <ConfirmDialog
      confirmLabel="删除集合"
      description={pendingCollection
        ? `将永久删除事项集合“${pendingCollection.name}”及其中的 ${pendingCollection.itemCount} 条代办。`
        : ""}
      open={pendingCollection !== null}
      title="删除事项集合"
      onCancel={onCancel}
      onConfirm={() => {
        if (pendingCollection) onDelete(pendingCollection.id);
        onCancel();
      }}
    />
  );
}

export function TodoContext({ view }: TodoViewProps) {
  const feedback = useFeedback();
  const [createGuard] = useState(createTodoInlineEditBlurGuard);
  const [renameGuard] = useState(createTodoInlineEditBlurGuard);
  const [creating, setCreating] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [editing, setEditing] = useState<CollectionDraft | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<TodoCollectionListItem | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (editing && !view.collections.some(({ id }) => id === editing.id)) {
      setEditing(null);
    }
  }, [editing, view.collections]);

  const submitCreate = () => {
    if (!createValue.trim()) {
      setCreating(false);
      setCreateValue("");
      return;
    }
    const created = feedback.runAction(() => view.createCollection(createValue));

    if (created) {
      setCreating(false);
      setCreateValue("");
    }
  };
  const submitRename = () => {
    const draft = editing;

    setEditing(null);
    if (draft?.value.trim()) {
      feedback.runAction(() => view.renameCollection(draft.id, draft.value));
    }
  };

  return (
    <div className="activity-context-content todo-context">
      <div className="context-toolbar">
        <Button
          aria-label="新建事项集合"
          disabled={creating}
          onClick={() => {
            createGuard.begin();
            setCreating(true);
            setCreateValue("");
          }}
          title="新建事项集合"
          type="button"
          variant="icon"
        >
          <Plus aria-hidden="true" size={14} />
        </Button>
      </div>
      <div className="todo-collection-scroll">
        <CompactContextGroup
          count={view.collections.length}
          headingId="todo-collections-heading"
          label="事项集合"
          listAriaLabel="事项集合"
        >
          {view.collections.map((collection, index) => (
            <CompactContextRow
              actions={!collection.isActive || editing?.id === collection.id
                ? null
                : (
                  <>
                    <button
                      aria-label={`调整事项集合顺序 ${collection.name}`}
                      className="todo-drag-handle"
                      draggable
                      onDragEnd={() => setDraggingId(null)}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(collectionDragType, collection.id);
                        setDraggingId(collection.id);
                      }}
                      title="拖动排序"
                      type="button"
                    >
                      <GripVertical aria-hidden="true" size={13} />
                    </button>
                    <button
                      aria-label={`重命名事项集合 ${collection.name}`}
                      onClick={() => {
                        renameGuard.begin();
                        setEditing({ id: collection.id, value: collection.name });
                      }}
                      title="重命名"
                      type="button"
                    >
                      <Pencil aria-hidden="true" size={13} />
                    </button>
                    <button
                      aria-label={`删除事项集合 ${collection.name}`}
                      onClick={() => setPendingDelete(collection)}
                      title="删除"
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={13} />
                    </button>
                  </>
                )}
              className={draggingId === collection.id ? "is-dragging" : undefined}
              icon={<ListChecks aria-hidden="true" size={13} />}
              inlineRename={editing?.id === collection.id
                ? {
                    ariaLabel: `重命名事项集合 ${collection.name}`,
                    onBlur: () => renameGuard.onBlur(submitRename),
                    onCancel: () => {
                      renameGuard.cancel();
                      setEditing(null);
                    },
                    onChange: (value) => setEditing({ id: collection.id, value }),
                    onSubmit: () => {
                      renameGuard.submit();
                      submitRename();
                    },
                    value: editing.value,
                  }
                : undefined}
              key={collection.id}
              label={collection.name}
              onBeginRename={() => {
                renameGuard.begin();
                setEditing({ id: collection.id, value: collection.name });
              }}
              onSelect={() => view.selectCollection(collection.id)}
              rowProps={{
                "data-todo-collection-id": collection.id,
                onDragOver: (event) => {
                  if (draggingId && draggingId !== collection.id) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                },
                onDrop: (event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData(collectionDragType);

                  if (sourceId && sourceId !== collection.id) {
                    feedback.runAction(() => view.moveCollection(
                      sourceId as TodoCollectionListItem["id"],
                      index,
                    ));
                  }
                  setDraggingId(null);
                },
              }}
              selected={collection.isActive}
              title={collection.name}
              trailing={
                <span className="ui-tree-meta todo-collection-count">
                  {collection.completedItemCount}/{collection.itemCount}
                </span>
              }
            />
          ))}
          {creating ? (
            <CompactContextRow
              icon={<ListChecks aria-hidden="true" size={13} />}
              inlineRename={{
                ariaLabel: "新建事项集合名称",
                onBlur: () => createGuard.onBlur(submitCreate),
                onCancel: () => {
                  createGuard.cancel();
                  setCreating(false);
                },
                onChange: setCreateValue,
                onSubmit: () => {
                  createGuard.submit();
                  submitCreate();
                },
                value: createValue,
              }}
              label=""
              onSelect={() => undefined}
            />
          ) : null}
        </CompactContextGroup>
        {view.collections.length === 0 && !creating ? (
          <p className="context-empty">没有事项集合。</p>
        ) : null}
      </div>
      <TodoCollectionDeleteConfirmation
        pendingCollection={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onDelete={(id) => feedback.runAction(() => view.deleteCollection(id))}
      />
    </div>
  );
}

export function TodoEditorPanel({
  focusMode,
  onToggleFocusMode,
  view,
}: TodoViewProps & {
  focusMode: boolean;
  onToggleFocusMode: () => void;
}) {
  const feedback = useFeedback();

  if (!view.activeCollection) {
    return (
      <Panel aria-label="代办编辑" className="todo-editor-panel">
        <EmptyState
          action={<Button onClick={() => view.createCollection("事项")} type="button" variant="primary">新建事项集合</Button>}
          description="创建集合后，使用代办符号逐行记录事项。"
          title="还没有事项集合"
        />
      </Panel>
    );
  }

  return (
    <Panel aria-label="代办编辑" className="todo-editor-panel">
      <PanelHeader
        actions={
          <>
            <span className={view.persistenceErrorMessage ? "ui-error" : "todo-persistence-state"}>
              {view.persistenceErrorMessage || persistenceLabel(view)}
            </span>
            <Button
              aria-label={focusMode ? "退出专注模式" : "进入专注模式"}
              onClick={onToggleFocusMode}
              title={focusMode ? "退出专注模式" : "进入专注模式"}
              type="button"
              variant="icon"
            >
              {focusMode
                ? <Minimize2 aria-hidden="true" size={14} />
                : <Maximize2 aria-hidden="true" size={14} />}
            </Button>
          </>
        }
        title={view.activeCollection.name}
      />
      <CtnEditor
        checkableBlocks={view.editor.checkableBlocks}
        contentMode={view.editor.contentMode}
        focusTarget={view.editor.focusTarget}
        key={view.activeCollection.id}
        syntaxProfile={view.editor.syntaxProfile}
        value={view.editor.documentText}
        onActiveLineChange={view.editor.onActiveLineChange}
        onChange={(change) => feedback.runAction(() => view.editor.updateBody(change))}
        onConsumeFocusTarget={view.editor.onConsumeFocusTarget}
        onToggleCheckableBlock={(blockId) => feedback.runAction(() =>
          view.toggleBlock(view.activeCollection!.id, blockId)
        )}
      />
    </Panel>
  );
}

function resolveBlockDropKind(event: DragEvent<HTMLLIElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;

  return ratio < 0.25 ? "above" : ratio > 0.75 ? "below" : "inside";
}

function TodoStructureNodes({
  collectionId,
  nodes,
  view,
}: {
  collectionId: TodoCollectionListItem["id"];
  nodes: TodoBlockView[];
  view: TodoViewModel;
}) {
  const feedback = useFeedback();

  return (
    <ul className="todo-structure-tree" role="tree">
      {nodes.map((node) => (
        <li
          aria-level={node.level + 1}
          className={cx(
            "todo-structure-item",
            node.completed && "is-completed",
            node.hasDiagnostics && "has-diagnostics",
          )}
          draggable
          key={node.id}
          onDragOver={(event) => {
            const sourceId = event.dataTransfer.getData(blockDragType);
            if (sourceId && sourceId !== node.id) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          }}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(blockDragType, node.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const sourceId = event.dataTransfer.getData(blockDragType);

            if (sourceId && sourceId !== node.id) {
              feedback.runAction(() => view.moveBlock(collectionId, sourceId, {
                kind: resolveBlockDropKind(event),
                targetBlockId: node.id,
              }));
            }
          }}
          role="treeitem"
        >
          <div className="todo-structure-row">
            <GripVertical aria-hidden="true" className="todo-structure-grip" size={13} />
            <input
              aria-label={`${node.completed ? "标记未完成" : "标记完成"} ${node.text}`}
              checked={node.completed}
              onChange={() => feedback.runAction(() =>
                view.toggleBlock(collectionId, node.id)
              )}
              type="checkbox"
            />
            <button
              className="todo-structure-label"
              onClick={() => view.outline.onSelectLine(node.lineNumber)}
              title={`${node.label} · L${node.lineNumber}`}
              type="button"
            >
              {node.text}
            </button>
          </div>
          {node.children.length > 0 ? (
            <TodoStructureNodes
              collectionId={collectionId}
              nodes={node.children}
              view={view}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function TodoDetailPanel({
  onCollapseDetail,
  view,
}: TodoViewProps & { onCollapseDetail: () => void }) {
  if (!view.activeCollection) return null;

  return (
    <Panel aria-label="代办结构" className="todo-detail-panel" tone="detail">
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
      <PanelBody scroll>
        {view.outline.nodes.length > 0 ? (
          <TodoStructureNodes
            collectionId={view.activeCollection.id}
            nodes={view.outline.nodes}
            view={view}
          />
        ) : (
          <p className="context-empty">使用代办符号添加事项后，这里会显示层级结构。</p>
        )}
      </PanelBody>
    </Panel>
  );
}
