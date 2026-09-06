// SPDX-License-Identifier: GPL-3.0-or-later

import { ListChecks, Plus } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import type {
  TodoCollectionListItem,
  TodoViewModel,
} from "../../../application/todo/index.ts";
import {
  CompactContextActionButtons,
  CompactContextList,
  CompactContextRow,
  useFeedback,
  getListReorderIndex,
  getListRowDropPlacement,
  type ListRowDropPlacement,
  Button,
  cx,
} from "../../ui/index.ts";




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

export function TodoContext({ view }: { view: TodoViewModel }) {
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

    if (deleted === true) setPendingDelete(null);
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
        <CompactContextList aria-label="事项集合">
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
                          cancelAriaLabel:
                            `取消删除事项集合 ${collection.name}`,
                          confirmAriaLabel:
                            `确认删除事项集合 ${collection.name}`,
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
                  event.dataTransfer.setData(collectionDragType, collection.id);
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
                      "aria-invalid": editing.errorMessage ? true : undefined,
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

                    feedback.runAction(() =>
                      view.moveCollection(sourceId, toIndex)
                    );
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
        </CompactContextList>
        {view.collections.length === 0 && !creating ? (
          <p className="context-empty">没有事项集合。</p>
        ) : null}
      </div>
    </div>
  );
}
