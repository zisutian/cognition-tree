// SPDX-License-Identifier: GPL-3.0-or-later

import { ChevronRight } from "lucide-react";
import type {
  TodoBlockView,
  TodoCollectionListItem,
  TodoViewModel,
} from "../../../../application/todo";
import { useFeedback } from "../../../ui/shared/FeedbackProvider";
import {
  Button,
  Panel,
  PanelBody,
  PanelHeader,
  cx,
} from "../../../ui/shared/primitives";
import { getStructureTreeRowStyle } from "../../../ui/shared/tree";

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
}: {
  onCollapseDetail: () => void;
  view: TodoViewModel;
}) {
  if (!view.activeCollection) return null;

  return (
    <Panel aria-label="代办结构" className="todo-detail-panel" tone="detail">
      <PanelHeader
        actions={(
          <Button
            aria-label="收回右侧详情"
            onClick={onCollapseDetail}
            title="收回右侧详情"
            type="button"
            variant="icon"
          >
            <ChevronRight aria-hidden="true" size={13} />
          </Button>
        )}
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
          <p className="context-empty">
            使用代办符号添加事项后，这里会显示层级结构。
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
