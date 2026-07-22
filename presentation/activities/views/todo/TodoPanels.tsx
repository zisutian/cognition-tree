// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ChevronRight,
  ListChecks,
  Maximize2,
  Minimize2,
  Plus,
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
} from "../../../../application/todo";
import { CtnEditor } from "../../../editor/CtnEditor";
import {
  CompactContextGroup,
  CompactContextActionButtons,
  CompactContextRow,
} from "../../../ui/shared/CompactContextList";
import { useFeedback } from "../../../ui/shared/FeedbackProvider";
import {
  getListReorderIndex,
  getListRowDropPlacement,
  type ListRowDropPlacement,
} from "../../../ui/shared/listDrag";
import { getStructureTreeRowStyle } from "../../../ui/shared/tree";
import {
  Button,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  cx,
} from "../../../ui/shared/primitives";

type TodoViewProps = { view: TodoViewModel };
type CollectionDraft = {
  errorMessage?: string;
  id: TodoCollectionListItem["id"];
  value: string;
};
type CollectionDragState = {
  placement: ListRowDropPlacement | null;
  sourceId: TodoCollectionListItem["id"];
  targetId: TodoCollectionListItem["id"] | null;
};

const collectionDragType = "application/x-cognition-tree-todo-collection";

function getCollectionDropPlacement(event: DragEvent<HTMLLIElement>) {
  const rect = event.currentTarget.getBoundingClientRect();

  return getListRowDropPlacement({
    offsetY: event.clientY - rect.top,
    rowHeight: rect.height,
  });
}

export function TodoContext({ view }: TodoViewProps) {
  const feedback = useFeedback();
  const [creating, setCreating] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [createErrorMessage, setCreateErrorMessage] = useState("");
  const [editing, setEditing] = useState<CollectionDraft | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<TodoCollectionListItem | null>(null);
  const [dragState, setDragState] = useState<CollectionDragState | null>(null);

  useEffect(() => {
    if (editing && !view.collections.some(({ id }) => id === editing.id)) {
      setEditing(null);
    }
  }, [editing, view.collections]);

  useEffect(() => {
    setEditing(null);
    setPendingDelete(null);
  }, [view.activeCollection?.id]);

  const submitCreate = () => {
    if (!createValue.trim()) {
      setCreateErrorMessage("名称不能为空。");
      feedback.notifyError(new Error("事项集合名称不能为空。"));
      return;
    }
    const created = feedback.runAction(() => {
      view.createCollection(createValue);
      return true;
    });

    if (created === true) {
      setCreating(false);
      setCreateValue("");
      setCreateErrorMessage("");
    } else {
      setCreateErrorMessage("创建失败，请修正后重试。");
    }
  };
  const submitRename = () => {
    const draft = editing;

    if (!draft) return;
    if (!draft.value.trim()) {
      setEditing({ ...draft, errorMessage: "名称不能为空。" });
      feedback.notifyError(new Error("事项集合名称不能为空。"));
      return;
    }
    if (
      view.collections.find(({ id }) => id === draft.id)?.name ===
        draft.value.trim()
    ) {
      setEditing(null);
      return;
    }
    const renamed = feedback.runAction(() => {
      view.renameCollection(draft.id, draft.value);
      return true;
    });

    if (renamed === true) {
      setEditing(null);
    } else {
      setEditing({ ...draft, errorMessage: "重命名失败，请修正后重试。" });
    }
  };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    const deleted = feedback.runAction(() => {
      view.deleteCollection(pendingDelete.id);
      return true;
    });

    if (deleted === true) {
      setPendingDelete(null);
    }
  };

  return (
    <div className="activity-context-content todo-context">
      <div className="context-toolbar">
        <Button
          aria-label="新建事项集合"
          disabled={creating}
          onClick={() => {
            setCreating(true);
            setCreateValue("");
            setCreateErrorMessage("");
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
          headingId="todo-collections-heading"
          label="事项集合"
          listAriaLabel="事项集合"
        >
          {view.collections.map((collection, index) => (
            <CompactContextRow
              actions={collection.isActive && editing?.id !== collection.id
                ? (
                  <CompactContextActionButtons
                    actions={pendingDelete?.id === collection.id
                      ? undefined
                      : [
                          {
                            ariaLabel: `重命名事项集合 ${collection.name}`,
                            label: "改",
                            onSelect: () => {
                              setEditing({
                                id: collection.id,
                                value: collection.name,
                              });
                              setPendingDelete(null);
                            },
                          },
                          {
                            ariaLabel: `删除事项集合 ${collection.name}`,
                            label: "删",
                            onSelect: () => setPendingDelete(collection),
                            tone: "danger",
                          },
                        ]}
                    confirmation={pendingDelete?.id === collection.id
                      ? {
                          cancelAriaLabel: `取消删除事项集合 ${collection.name}`,
                          confirmAriaLabel: `确认删除事项集合 ${collection.name}`,
                          onCancel: () => setPendingDelete(null),
                          onConfirm: confirmDelete,
                        }
                      : undefined}
                  />
                )
                : undefined}
              buttonProps={{
                draggable: editing?.id !== collection.id,
                onDragEnd: () => setDragState(null),
                onDragStart: (event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    collectionDragType,
                    collection.id,
                  );
                  event.dataTransfer.setData("text/plain", collection.id);
                  setDragState({
                    placement: null,
                    sourceId: collection.id,
                    targetId: null,
                  });
                },
              }}
              className={cx(
                pendingDelete?.id === collection.id && "is-delete-pending",
                dragState?.sourceId === collection.id && "is-dragging",
                dragState?.targetId === collection.id && "is-drop-target",
                dragState?.targetId === collection.id &&
                  dragState.placement &&
                  `is-drop-${dragState.placement}`,
              )}
              icon={<ListChecks aria-hidden="true" size={13} />}
              inlineRename={editing?.id === collection.id
                ? {
                    ariaLabel: `重命名事项集合 ${collection.name}`,
                    inputProps: {
                      "aria-invalid": editing.errorMessage
                        ? true
                        : undefined,
                    },
                    onCancel: () => setEditing(null),
                    onChange: (value) => setEditing({
                      id: collection.id,
                      value,
                    }),
                    onSubmit: submitRename,
                    value: editing.value,
                  }
                : undefined}
              key={collection.id}
              label={collection.name}
              onBeginRename={() => {
                setEditing({ id: collection.id, value: collection.name });
                setPendingDelete(null);
              }}
              onSelect={() => {
                setEditing(null);
                setPendingDelete(null);
                view.selectCollection(collection.id);
              }}
              rowProps={{
                "data-todo-collection-id": collection.id,
                onDragLeave: (event) => {
                  const nextTarget = event.relatedTarget;

                  if (
                    nextTarget instanceof Node &&
                    event.currentTarget.contains(nextTarget)
                  ) {
                    return;
                  }

                  setDragState((current) =>
                    current?.targetId === collection.id
                      ? { ...current, placement: null, targetId: null }
                      : current
                  );
                },
                onDragOver: (event) => {
                  if (!dragState || dragState.sourceId === collection.id) return;

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragState({
                    ...dragState,
                    placement: getCollectionDropPlacement(event),
                    targetId: collection.id,
                  });
                },
                onDrop: (event) => {
                  event.preventDefault();
                  const sourceId = (
                    event.dataTransfer.getData(collectionDragType) ||
                    event.dataTransfer.getData("text/plain") ||
                    dragState?.sourceId ||
                    ""
                  ) as TodoCollectionListItem["id"];
                  const sourceIndex = view.collections.findIndex(
                    ({ id }) => id === sourceId,
                  );

                  if (sourceIndex >= 0 && sourceId !== collection.id) {
                    const toIndex = getListReorderIndex({
                      placement: getCollectionDropPlacement(event),
                      sourceIndex,
                      targetIndex: index,
                    });

                    feedback.runAction(() => view.moveCollection(
                      sourceId,
                      toIndex,
                    ));
                  }
                  setDragState(null);
                },
              }}
              selected={collection.isActive}
              title={collection.name}
            />
          ))}
          {creating ? (
            <CompactContextRow
              icon={<ListChecks aria-hidden="true" size={13} />}
              inlineRename={{
                ariaLabel: "新建事项集合名称",
                inputProps: {
                  "aria-invalid": createErrorMessage ? true : undefined,
                },
                onCancel: () => {
                  setCreating(false);
                  setCreateErrorMessage("");
                },
                onChange: (value) => {
                  setCreateValue(value);
                  setCreateErrorMessage("");
                },
                onSubmit: submitCreate,
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

function TodoStructureNodes({
  collectionId,
  depth,
  nodes,
  selectedLineNumber,
  view,
}: {
  collectionId: TodoCollectionListItem["id"];
  depth: number;
  nodes: TodoBlockView[];
  selectedLineNumber: number | null;
  view: TodoViewModel;
}) {
  const feedback = useFeedback();

  return (
    <ul
      className="ui-tree ui-structure-tree todo-structure-tree"
      role={depth === 0 ? "tree" : "group"}
    >
      {nodes.map((node) => {
        const selected = selectedLineNumber === node.lineNumber;

        return (
          <li
            aria-expanded={node.children.length > 0 ? true : undefined}
            aria-level={depth + 1}
            aria-selected={selected}
            className={cx(
              "ui-structure-tree-item",
              "todo-structure-item",
              node.completed && "is-completed",
            )}
            key={node.id}
            role="treeitem"
          >
            <div
              className={cx(
                "ui-tree-row",
                "ui-structure-tree-row",
                "todo-structure-row",
                selected && "is-selected",
                node.hasDiagnostics && "has-diagnostics",
              )}
              style={getStructureTreeRowStyle({
                depth,
                indentUnitCount: view.editor.syntaxProfile.tabDisplayWidth,
              })}
            >
              <span className="ui-structure-prefix">
                <input
                  aria-label={`${node.completed ? "标记未完成" : "标记完成"} ${node.text}`}
                  checked={node.completed}
                  onChange={() => feedback.runAction(() =>
                    view.toggleBlock(collectionId, node.id)
                  )}
                  type="checkbox"
                />
              </span>
              <button
                className="todo-structure-label"
                onClick={() => view.outline.onSelectLine(node.lineNumber)}
                title={`${node.label}: ${node.text} · L${node.lineNumber}`}
                type="button"
              >
                <span className="block-text">{node.text}</span>
              </button>
              <span className="ui-tree-meta">L{node.lineNumber}</span>
            </div>
            {node.children.length > 0 ? (
              <TodoStructureNodes
                collectionId={collectionId}
                depth={depth + 1}
                nodes={node.children}
                selectedLineNumber={selectedLineNumber}
                view={view}
              />
            ) : null}
          </li>
        );
      })}
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
            depth={0}
            nodes={view.outline.nodes}
            selectedLineNumber={view.outline.activeBlock?.lineNumber ?? null}
            view={view}
          />
        ) : (
          <p className="context-empty">使用代办符号添加事项后，这里会显示层级结构。</p>
        )}
      </PanelBody>
    </Panel>
  );
}
