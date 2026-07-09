import {
  BlockText,
  type DisplayText,
} from "../blockText";
import { cx } from "../primitives";
import { getStructureTreeRowStyle } from "./structureIndent";
import type {
  StructureTreeNode,
  StructureTreeProps,
} from "./types";

export function StructureTreeRowContent({
  label,
  lineLabel,
  textDisplay,
}: {
  label: string;
  lineLabel: string;
  textDisplay: DisplayText;
}) {
  return (
    <>
      <span className="ui-structure-prefix">
        <span className="ui-structure-marker">{label}</span>
      </span>
      <BlockText text={textDisplay} />
      <span className="ui-tree-meta">{lineLabel}</span>
    </>
  );
}

function StructureTreeContent({
  activeLineNumber,
  activeLineNumbers,
  className,
  depth,
  dragDataType,
  draggingLineNumber,
  draggable = false,
  getDragPayload,
  indentUnitCount,
  nodes,
  selectedRootLineNumber,
  onDragEnd,
  onDragStart,
  onSelectLine,
}: StructureTreeProps & { depth: number }) {
  return (
    <ul className={cx("ui-tree ui-structure-tree", className)}>
      {nodes.map((node) => {
        const isSelected =
          activeLineNumber === node.lineNumber ||
          activeLineNumbers?.has(node.lineNumber) === true;
        const isSelectedRoot = selectedRootLineNumber === node.lineNumber;
        const payload = getDragPayload?.(node.lineNumber) ?? String(node.lineNumber);

        return (
          <li
            className={cx(
              "ui-structure-tree-item",
              isSelected && "is-selected-subtree",
              isSelectedRoot && "is-selected-root",
            )}
            key={node.id}
          >
            <button
              className={cx(
                "ui-tree-row ui-structure-tree-row",
                isSelected && "is-selected",
                draggingLineNumber === String(node.lineNumber) && "is-dragging",
                node.hasDiagnostics && "has-diagnostics",
              )}
              draggable={draggable}
              style={getStructureTreeRowStyle({ depth, indentUnitCount })}
              onClick={() => onSelectLine?.(node.lineNumber)}
              onDragEnd={onDragEnd}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", payload);

                if (dragDataType) {
                  event.dataTransfer.setData(dragDataType, payload);
                }

                onDragStart?.(node.lineNumber, event);
              }}
              title={`${node.label}: ${node.textDisplay.displayText}`}
              type="button"
            >
              <StructureTreeRowContent
                label={node.label}
                lineLabel={node.lineLabel}
                textDisplay={node.textDisplay}
              />
            </button>
            {node.children.length > 0 ? (
              <StructureTreeContent
                activeLineNumber={activeLineNumber}
                activeLineNumbers={activeLineNumbers}
                depth={depth + 1}
                dragDataType={dragDataType}
                draggingLineNumber={draggingLineNumber}
                draggable={draggable}
                getDragPayload={getDragPayload}
                indentUnitCount={indentUnitCount}
                nodes={node.children}
                selectedRootLineNumber={selectedRootLineNumber}
                onDragEnd={onDragEnd}
                onDragStart={onDragStart}
                onSelectLine={onSelectLine}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function StructureTree(props: StructureTreeProps) {
  return <StructureTreeContent {...props} depth={0} />;
}

export function OutlineTree({
  indentUnitCount,
  nodes,
  onSelectLine,
}: {
  indentUnitCount?: number;
  nodes: StructureTreeNode[];
  onSelectLine: (lineNumber: number) => void;
}) {
  return (
    <StructureTree
      indentUnitCount={indentUnitCount}
      nodes={nodes}
      onSelectLine={onSelectLine}
    />
  );
}
