// SPDX-License-Identifier: GPL-3.0-or-later

import {
  CheckSquare2,
  GripVertical,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type {
  TodoCollectionListItem,
  TodoItemView,
  TodoViewModel,
} from "../../../application/todo";
import { ConfirmDialog } from "../../shared/ConfirmDialog";
import {
  CompactContextGroup,
  CompactContextRow,
} from "../../shared/CompactContextList";
import { useFeedback } from "../../shared/FeedbackProvider";
import {
  Button,
  cx,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
} from "../../shared/primitives";

type TodoViewProps = {
  view: TodoViewModel;
};

type CollectionDraft = {
  id: TodoCollectionListItem["id"];
  value: string;
};

type ItemDraft = {
  id: TodoItemView["id"];
  value: string;
};

const todoCollectionDragType = "application/x-cognition-tree-todo-collection";
const todoItemDragType = "application/x-cognition-tree-todo-item";
const todoKeyboardSortShortcuts = "Enter Space ArrowUp ArrowDown Escape";

export type TodoKeyboardSortCommand =
  | { kind: "exit" }
  | { kind: "move"; toIndex: number }
  | null;

export function resolveTodoKeyboardSortCommand({
  active,
  currentIndex,
  itemCount,
  key,
}: {
  active: boolean;
  currentIndex: number;
  itemCount: number;
  key: string;
}): TodoKeyboardSortCommand {
  if (!active) {
    return null;
  }
  if (key === "Escape") {
    return { kind: "exit" };
  }
  if (key !== "ArrowUp" && key !== "ArrowDown") {
    return null;
  }

  const offset = key === "ArrowUp" ? -1 : 1;
  const maximumIndex = Math.max(0, itemCount - 1);

  return {
    kind: "move",
    toIndex: Math.min(maximumIndex, Math.max(0, currentIndex + offset)),
  };
}

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
        return;
      }
      submit();
    },
    submit() {
      ignoreNextBlur = true;
    },
  };
}

function readDragId(event: DragEvent<HTMLElement>, type: string) {
  return event.dataTransfer.getData(type) ||
    event.dataTransfer.getData("text/plain");
}

function isLeavingRow(event: DragEvent<HTMLElement>) {
  const nextTarget = event.relatedTarget;

  return !(nextTarget instanceof Node && event.currentTarget.contains(nextTarget));
}

function persistenceLabel(view: TodoViewModel) {
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
        if (pendingCollection) {
          onDelete(pendingCollection.id);
        }
        onCancel();
      }}
    />
  );
}

export function TodoContext({ view }: TodoViewProps) {
  const feedback = useFeedback();
  const [createBlurGuard] = useState(createTodoInlineEditBlurGuard);
  const [renameBlurGuard] = useState(createTodoInlineEditBlurGuard);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [editingCollection, setEditingCollection] =
    useState<CollectionDraft | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<TodoCollectionListItem | null>(null);
  const [draggingCollectionId, setDraggingCollectionId] =
    useState<string | null>(null);
  const [dropCollectionId, setDropCollectionId] =
    useState<string | null>(null);
  const [keyboardSortingCollectionId, setKeyboardSortingCollectionId] =
    useState<string | null>(null);

  useEffect(() => {
    if (
      keyboardSortingCollectionId &&
      !view.collections.some(({ id }) => id === keyboardSortingCollectionId)
    ) {
      setKeyboardSortingCollectionId(null);
    }
  }, [keyboardSortingCollectionId, view.collections]);
  const submitCreate = () => {
    const name = createValue.trim();

    if (!name) {
      setCreatingCollection(false);
      setCreateValue("");
      return;
    }
    const created = feedback.runAction(() => view.createCollection(name));

    if (created) {
      setCreatingCollection(false);
      setCreateValue("");
    }
  };
  const submitRename = () => {
    if (!editingCollection) {
      return;
    }
    const collection = view.collections.find(
      ({ id }) => id === editingCollection.id,
    );
    const name = editingCollection.value.trim();

    if (collection && name && name !== collection.name) {
      feedback.runAction(() => view.renameCollection(collection.id, name));
    }
    setEditingCollection(null);
  };
  const clearCollectionDrag = () => {
    setDraggingCollectionId(null);
    setDropCollectionId(null);
  };

  return (
    <div className="activity-context-content todo-context">
      <div className="context-toolbar">
        <Button
          aria-label="新建事项集合"
          disabled={creatingCollection}
          onClick={() => {
            setKeyboardSortingCollectionId(null);
            createBlurGuard.begin();
            setCreateValue("");
            setCreatingCollection(true);
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
          listClassName="todo-collection-list"
        >
          {view.collections.map((collection, collectionIndex) => (
            <CompactContextRow
              actions={editingCollection?.id === collection.id ? null : (
                <>
                  <button
                    aria-keyshortcuts={todoKeyboardSortShortcuts}
                    aria-label={
                      keyboardSortingCollectionId === collection.id
                        ? `正在调整事项集合顺序 ${collection.name}`
                        : `调整事项集合顺序 ${collection.name}`
                    }
                    aria-pressed={
                      keyboardSortingCollectionId === collection.id
                    }
                    className="todo-drag-handle"
                    draggable
                    onClick={() => {
                      setKeyboardSortingCollectionId((current) =>
                        current === collection.id ? null : collection.id
                      );
                    }}
                    onDragEnd={clearCollectionDrag}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setKeyboardSortingCollectionId(null);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        todoCollectionDragType,
                        collection.id,
                      );
                      event.dataTransfer.setData("text/plain", collection.id);
                      setDraggingCollectionId(collection.id);
                    }}
                    onKeyDown={(event) => {
                      const command = resolveTodoKeyboardSortCommand({
                        active:
                          keyboardSortingCollectionId === collection.id,
                        currentIndex: collectionIndex,
                        itemCount: view.collections.length,
                        key: event.key,
                      });

                      if (!command) {
                        return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      if (command.kind === "exit") {
                        setKeyboardSortingCollectionId(null);
                        return;
                      }
                      if (command.toIndex !== collectionIndex) {
                        feedback.runAction(() =>
                          view.moveCollection(collection.id, command.toIndex)
                        );
                      }
                    }}
                    title={keyboardSortingCollectionId === collection.id
                      ? "使用上下方向键移动，按 Escape 结束排序"
                      : "拖动排序，或按 Enter/空格开始键盘排序"}
                    type="button"
                  >
                    <GripVertical aria-hidden="true" size={13} />
                  </button>
                  <button
                    aria-label={`重命名事项集合 ${collection.name}`}
                    onClick={() => {
                      setKeyboardSortingCollectionId(null);
                      renameBlurGuard.begin();
                      setEditingCollection({
                        id: collection.id,
                        value: collection.name,
                      });
                    }}
                    title="重命名事项集合"
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={13} />
                  </button>
                  <button
                    aria-label={`删除事项集合 ${collection.name}`}
                    onClick={() => {
                      setKeyboardSortingCollectionId(null);
                      setPendingDelete(collection);
                    }}
                    title="删除事项集合"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={13} />
                  </button>
                </>
              )}
              className={cx(
                draggingCollectionId === collection.id && "is-dragging",
                dropCollectionId === collection.id &&
                  "is-drop-target is-drop-inside",
              )}
              icon={<ListChecks aria-hidden="true" size={13} />}
              inlineRename={editingCollection?.id === collection.id
                ? {
                    ariaLabel: `重命名事项集合 ${collection.name}`,
                    onBlur: () => renameBlurGuard.onBlur(submitRename),
                    onCancel: () => {
                      renameBlurGuard.cancel();
                      setEditingCollection(null);
                    },
                    onChange: (value) => setEditingCollection({
                      id: collection.id,
                      value,
                    }),
                    onSubmit: () => {
                      renameBlurGuard.submit();
                      submitRename();
                    },
                    value: editingCollection.value,
                  }
                : undefined}
              key={collection.id}
              label={collection.name}
              onBeginRename={() => {
                setKeyboardSortingCollectionId(null);
                renameBlurGuard.begin();
                setEditingCollection({
                  id: collection.id,
                  value: collection.name,
                });
              }}
              onSelect={() => view.selectCollection(collection.id)}
              rowProps={{
                "data-todo-collection-id": collection.id,
                onDragLeave: (event) => {
                  if (isLeavingRow(event)) {
                    setDropCollectionId(null);
                  }
                },
                onDragOver: (event) => {
                  if (
                    draggingCollectionId &&
                    draggingCollectionId !== collection.id
                  ) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropCollectionId(collection.id);
                  }
                },
                onDrop: (event) => {
                  event.preventDefault();
                  const sourceId = readDragId(event, todoCollectionDragType);
                  const targetIndex = view.collections.findIndex(
                    ({ id }) => id === collection.id,
                  );

                  if (
                    sourceId &&
                    sourceId !== collection.id &&
                    targetIndex >= 0 &&
                    view.collections.some(({ id }) => id === sourceId)
                  ) {
                    feedback.runAction(() =>
                      view.moveCollection(
                        sourceId as TodoCollectionListItem["id"],
                        targetIndex,
                      )
                    );
                  }
                  clearCollectionDrag();
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
          {creatingCollection ? (
            <CompactContextRow
              icon={<ListChecks aria-hidden="true" size={13} />}
              inlineRename={{
                ariaLabel: "新建事项集合名称",
                onBlur: () => createBlurGuard.onBlur(submitCreate),
                onCancel: () => {
                  createBlurGuard.cancel();
                  setCreatingCollection(false);
                  setCreateValue("");
                },
                onChange: setCreateValue,
                onSubmit: () => {
                  createBlurGuard.submit();
                  submitCreate();
                },
                value: createValue,
              }}
              label=""
              onSelect={() => undefined}
            />
          ) : null}
        </CompactContextGroup>
        {view.collections.length === 0 && !creatingCollection ? (
          <p className="context-empty">没有事项集合。</p>
        ) : null}
      </div>
      <TodoCollectionDeleteConfirmation
        pendingCollection={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onDelete={(collectionId) => {
          feedback.runAction(() => view.deleteCollection(collectionId));
        }}
      />
    </div>
  );
}

function TodoItemRow({
  activeCollectionId,
  draggingItemId,
  dropItemId,
  editingItem,
  item,
  view,
  onBeginEdit,
  onBlurEdit,
  onCancelEdit,
  onClearDrag,
  onDropItemChange,
  onEditValueChange,
  onStartDrag,
  onSubmitEdit,
  keyboardSorting,
  itemCount,
  itemIndex,
  onKeyboardSortingChange,
}: {
  activeCollectionId: NonNullable<TodoViewModel["activeCollection"]>["id"];
  draggingItemId: string | null;
  dropItemId: string | null;
  editingItem: ItemDraft | null;
  item: TodoItemView;
  view: TodoViewModel;
  onBeginEdit: (item: TodoItemView) => void;
  onBlurEdit: () => void;
  onCancelEdit: () => void;
  onClearDrag: () => void;
  onDropItemChange: (itemId: string | null) => void;
  onEditValueChange: (value: string) => void;
  onStartDrag: (itemId: TodoItemView["id"]) => void;
  onSubmitEdit: () => void;
  keyboardSorting: boolean;
  itemCount: number;
  itemIndex: number;
  onKeyboardSortingChange: (itemId: TodoItemView["id"] | null) => void;
}) {
  const feedback = useFeedback();
  const isEditing = editingItem?.id === item.id;
  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmitEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancelEdit();
    }
  };

  return (
    <li
      className={cx(
        "ui-tree-row-frame todo-item-row",
        item.completed && "is-completed",
        isEditing && "is-editing",
        draggingItemId === item.id && "is-dragging",
        dropItemId === item.id && "is-drop-target is-drop-inside",
      )}
      data-todo-item-id={item.id}
      onDragLeave={(event) => {
        if (isLeavingRow(event)) {
          onDropItemChange(null);
        }
      }}
      onDragOver={(event) => {
        if (draggingItemId && draggingItemId !== item.id) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onDropItemChange(item.id);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = readDragId(event, todoItemDragType);
        const targetIndex = view.items.findIndex(({ id }) => id === item.id);

        if (
          sourceId &&
          sourceId !== item.id &&
          targetIndex >= 0 &&
          view.items.some(({ id }) => id === sourceId)
        ) {
          feedback.runAction(() =>
            view.moveItem(
              activeCollectionId,
              sourceId as TodoItemView["id"],
              targetIndex,
            )
          );
        }
        onClearDrag();
      }}
    >
      <button
        aria-keyshortcuts={todoKeyboardSortShortcuts}
        aria-label={keyboardSorting
          ? `正在调整代办顺序 ${item.text}`
          : `调整代办顺序 ${item.text}`}
        aria-pressed={keyboardSorting}
        className="todo-drag-handle"
        draggable
        onClick={() => onKeyboardSortingChange(
          keyboardSorting ? null : item.id,
        )}
        onDragEnd={onClearDrag}
        onDragStart={(event) => {
          onKeyboardSortingChange(null);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(todoItemDragType, item.id);
          event.dataTransfer.setData("text/plain", item.id);
          onStartDrag(item.id);
        }}
        onKeyDown={(event) => {
          const command = resolveTodoKeyboardSortCommand({
            active: keyboardSorting,
            currentIndex: itemIndex,
            itemCount,
            key: event.key,
          });

          if (!command) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (command.kind === "exit") {
            onKeyboardSortingChange(null);
            return;
          }
          if (command.toIndex !== itemIndex) {
            feedback.runAction(() =>
              view.moveItem(activeCollectionId, item.id, command.toIndex)
            );
          }
        }}
        title={keyboardSorting
          ? "使用上下方向键移动，按 Escape 结束排序"
          : "拖动排序，或按 Enter/空格开始键盘排序"}
        type="button"
      >
        <GripVertical aria-hidden="true" size={14} />
      </button>
      <input
        aria-label={`${item.completed ? "标记未完成" : "标记完成"} ${item.text}`}
        checked={item.completed}
        className="todo-item-checkbox"
        onChange={() => feedback.runAction(() =>
          view.toggleItem(activeCollectionId, item.id)
        )}
        type="checkbox"
      />
      {isEditing ? (
        <input
          autoFocus
          aria-label={`编辑代办 ${item.text}`}
          className="ui-input todo-item-edit-input"
          value={editingItem.value}
          onBlur={onBlurEdit}
          onChange={(event) => onEditValueChange(event.target.value)}
          onKeyDown={handleEditKeyDown}
        />
      ) : (
        <button
          className="todo-item-text"
          onDoubleClick={() => onBeginEdit(item)}
          onKeyDown={(event) => {
            if (event.key === "F2") {
              event.preventDefault();
              onBeginEdit(item);
            }
          }}
          title={item.text}
          type="button"
        >
          {item.text}
        </button>
      )}
      {isEditing ? null : (
        <span className="ui-tree-actions todo-item-actions">
          <button
            aria-label={`编辑代办 ${item.text}`}
            onClick={() => {
              onKeyboardSortingChange(null);
              onBeginEdit(item);
            }}
            title="编辑代办"
            type="button"
          >
            <Pencil aria-hidden="true" size={13} />
          </button>
          <button
            aria-label={`删除代办 ${item.text}`}
            onClick={() => {
              onKeyboardSortingChange(null);
              feedback.runAction(() =>
                view.deleteItem(activeCollectionId, item.id)
              );
            }}
            title="删除代办"
            type="button"
          >
            <Trash2 aria-hidden="true" size={13} />
          </button>
        </span>
      )}
    </li>
  );
}

export function TodoChecklistPanel({ view }: TodoViewProps) {
  const feedback = useFeedback();
  const [editBlurGuard] = useState(createTodoInlineEditBlurGuard);
  const activeCollection = view.activeCollection;
  const [newItemText, setNewItemText] = useState("");
  const [editingItem, setEditingItem] = useState<ItemDraft | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropItemId, setDropItemId] = useState<string | null>(null);
  const [keyboardSortingItemId, setKeyboardSortingItemId] =
    useState<TodoItemView["id"] | null>(null);

  useEffect(() => {
    setNewItemText("");
    setEditingItem(null);
    setDraggingItemId(null);
    setDropItemId(null);
    setKeyboardSortingItemId(null);
  }, [activeCollection?.id]);

  useEffect(() => {
    if (
      keyboardSortingItemId &&
      !view.items.some(({ id }) => id === keyboardSortingItemId)
    ) {
      setKeyboardSortingItemId(null);
    }
  }, [keyboardSortingItemId, view.items]);

  if (!activeCollection) {
    return (
      <Panel aria-label="代办清单" className="todo-checklist-panel">
        <EmptyState
          description="从左侧新建事项集合后即可添加逐项代办。"
          title="还没有事项集合"
        />
      </Panel>
    );
  }

  const createItem = () => {
    const text = newItemText.trim();

    if (!text) {
      return;
    }
    const created = feedback.runAction(() =>
      view.createItem(activeCollection.id, text)
    );

    if (created) {
      setNewItemText("");
    }
  };
  const submitItemEdit = () => {
    if (!editingItem) {
      return;
    }
    const item = view.items.find(({ id }) => id === editingItem.id);
    const text = editingItem.value.trim();

    if (!text) {
      setEditingItem(null);
      return;
    }
    if (item && item.text !== text) {
      feedback.runAction(() =>
        view.updateItemText(activeCollection.id, item.id, text)
      );
    }
    setEditingItem(null);
  };
  const clearItemDrag = () => {
    setDraggingItemId(null);
    setDropItemId(null);
  };

  return (
    <Panel aria-label="代办清单" className="todo-checklist-panel">
      <PanelHeader
        actions={view.persistenceErrorMessage ? (
          <span className="ui-error">{view.persistenceErrorMessage}</span>
        ) : (
          <span className="todo-persistence-state">
            {persistenceLabel(view)}
          </span>
        )}
        title={activeCollection.name}
      />
      <PanelBody className="todo-checklist-body" scroll>
        <form
          className="todo-new-item-form"
          onSubmit={(event) => {
            event.preventDefault();
            createItem();
          }}
        >
          <input
            aria-label={`在 ${activeCollection.name} 中新建代办`}
            className="ui-input"
            placeholder="添加代办"
            value={newItemText}
            onChange={(event) => setNewItemText(event.target.value)}
          />
          <Button
            aria-label="添加代办"
            disabled={newItemText.trim().length === 0}
            title="添加代办"
            type="submit"
            variant="icon"
          >
            <Plus aria-hidden="true" size={14} />
          </Button>
        </form>
        {view.items.length > 0 ? (
          <ul
            aria-label={`${activeCollection.name}代办`}
            className="ui-tree todo-item-list"
          >
            {view.items.map((item, itemIndex) => (
              <TodoItemRow
                activeCollectionId={activeCollection.id}
                draggingItemId={draggingItemId}
                dropItemId={dropItemId}
                editingItem={editingItem}
                item={item}
                itemCount={view.items.length}
                itemIndex={itemIndex}
                key={item.id}
                keyboardSorting={keyboardSortingItemId === item.id}
                view={view}
                onBeginEdit={(nextItem) => {
                  setKeyboardSortingItemId(null);
                  editBlurGuard.begin();
                  setEditingItem({
                    id: nextItem.id,
                    value: nextItem.text,
                  });
                }}
                onBlurEdit={() => editBlurGuard.onBlur(submitItemEdit)}
                onCancelEdit={() => {
                  editBlurGuard.cancel();
                  setEditingItem(null);
                }}
                onClearDrag={clearItemDrag}
                onDropItemChange={setDropItemId}
                onEditValueChange={(value) => setEditingItem({
                  id: item.id,
                  value,
                })}
                onKeyboardSortingChange={setKeyboardSortingItemId}
                onStartDrag={(itemId) => {
                  setDraggingItemId(itemId);
                  setDropItemId(null);
                }}
                onSubmitEdit={() => {
                  editBlurGuard.submit();
                  submitItemEdit();
                }}
              />
            ))}
          </ul>
        ) : (
          <div className="todo-empty-items">
            <CheckSquare2 aria-hidden="true" size={18} />
            <p>这个集合还没有代办。</p>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
