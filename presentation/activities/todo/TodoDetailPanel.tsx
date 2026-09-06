// SPDX-License-Identifier: GPL-3.0-or-later

import { Repeat2 } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  TodoBlockView,
  TodoCollectionListItem,
  TodoViewModel,
} from "../../../application/todo/index.ts";
import {
  useFeedback,
  CheckboxControl,
  Button,
  DetailPanel,
  PanelBody,
  cx,
  getStructureTreeRowStyle,
} from "../../ui/index.ts";


import { TodoRecurrenceEditor } from "./TodoRecurrenceEditor.tsx";

function TodoStructureNodes({
  collectionId,
  depth,
  nodes,
  selectedLineNumber,
  recurrenceEditorBlockId,
  setRecurrenceEditorBlockId,
  view,
}: {
  collectionId: TodoCollectionListItem["id"];
  depth: number;
  nodes: TodoBlockView[];
  selectedLineNumber: number | null;
  recurrenceEditorBlockId: string | null;
  setRecurrenceEditorBlockId: (blockId: string | null) => void;
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
        const editingRecurrence = recurrenceEditorBlockId === node.id;

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
                indentUnitCount: view.editor.syntax.tabDisplayWidth,
              })}
            >
              <span className="ui-structure-prefix">
                <CheckboxControl
                  aria-label={`${node.completed ? "标记未完成" : "标记完成"} ${node.text}`}
                  checked={node.completed}
                  onChange={() => feedback.runAction(() =>
                    view.toggleBlock(collectionId, node.id)
                  )}
                />
              </span>
              <Button
                className="todo-structure-label"
                onClick={() => view.outline.onSelectLine(node.lineNumber)}
                title={`${node.label}: ${node.text} · L${node.lineNumber}`}
                type="button"
                variant="bare"
              >
                <span className="block-text">{node.text}</span>
              </Button>
              <span className="ui-tree-meta todo-structure-meta">
                {node.recurrence?.progress ? (
                  <span
                    aria-label={node.recurrence.progress.ariaLabel}
                    className="todo-recurrence-progress"
                    role="img"
                    title={node.recurrence.progress.ariaLabel}
                  >
                    {node.recurrence.progress.text}
                  </span>
                ) : null}
                <span>L{node.lineNumber}</span>
                {selected ? (
                  <Button
                    aria-label={`配置周期 ${node.text}`}
                    className={cx(
                      "todo-recurrence-button",
                      node.recurrence?.progress && "is-active",
                    )}
                    onClick={() =>
                      setRecurrenceEditorBlockId(
                        editingRecurrence ? null : node.id,
                      )}
                    title={node.recurrence?.progress
                      ? node.recurrence.progress.ariaLabel
                      : "配置周期"}
                    type="button"
                    variant="icon"
                  >
                    <Repeat2 aria-hidden="true" size={12} />
                  </Button>
                ) : null}
              </span>
            </div>
            {editingRecurrence ? (
              <TodoRecurrenceEditor
                key={`${node.id}:${node.recurrence?.active ? "active" : "plain"}`}
                node={node}
                onCancel={() => setRecurrenceEditorBlockId(null)}
                onConfirm={(rule) => {
                  if (rule) {
                    view.setBlockRecurrence(collectionId, node.id, rule);
                  } else {
                    view.stopBlockRecurrence(collectionId, node.id);
                  }
                  setRecurrenceEditorBlockId(null);
                }}
              />
            ) : null}
            {node.children.length > 0 ? (
              <TodoStructureNodes
                collectionId={collectionId}
                depth={depth + 1}
                nodes={node.children}
                recurrenceEditorBlockId={recurrenceEditorBlockId}
                selectedLineNumber={selectedLineNumber}
                setRecurrenceEditorBlockId={setRecurrenceEditorBlockId}
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
}: {
  onCollapseDetail: () => void;
  view: TodoViewModel;
}) {
  const [recurrenceEditorBlockId, setRecurrenceEditorBlockId] =
    useState<string | null>(null);
  const selectedBlockId = view.outline.activeBlock?.id ?? null;

  useEffect(() => {
    setRecurrenceEditorBlockId((current) =>
      current === selectedBlockId ? current : null
    );
  }, [selectedBlockId]);

  if (!view.activeCollection) return null;

  return (
    <DetailPanel
      aria-label="代办结构"
      className="todo-detail-panel"
      onCollapse={onCollapseDetail}
      title="结构"
    >
      <PanelBody scroll>
        {view.outline.nodes.length > 0 ? (
          <TodoStructureNodes
            collectionId={view.activeCollection.id}
            depth={0}
            nodes={view.outline.nodes}
            recurrenceEditorBlockId={recurrenceEditorBlockId}
            selectedLineNumber={view.outline.activeBlock?.lineNumber ?? null}
            setRecurrenceEditorBlockId={setRecurrenceEditorBlockId}
            view={view}
          />
        ) : (
          <p className="context-empty">
            使用代办符号添加事项后，这里会显示层级结构。
          </p>
        )}
      </PanelBody>
    </DetailPanel>
  );
}
