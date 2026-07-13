import {
  BlockText,
  type DisplayText,
} from "../blockText";
import { cx } from "../primitives";
import { getStructureTreeRowStyle } from "./structureIndent";
import type {
  StructureTreeProps,
} from "./types";

function StructureTreeRowContent({
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
  className,
  depth,
  getRowProps,
  indentUnitCount,
  nodes,
  selectedLineNumbers,
  selectedRootLineNumber,
  onSelectLine,
}: StructureTreeProps & { depth: number }) {
  return (
    <ul className={cx("ui-tree ui-structure-tree", className)}>
      {nodes.map((node) => {
        const isSelected = selectedLineNumbers?.has(node.lineNumber) === true;
        const isSelectedRoot = selectedRootLineNumber === node.lineNumber;
        const rowProps = getRowProps?.(node, {
          depth,
          isSelected,
          isSelectedRoot,
        });
        const { className: rowClassName, ...rowAttributes } = rowProps ?? {};

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
              {...rowAttributes}
              className={cx(
                "ui-tree-row ui-structure-tree-row",
                isSelected && "is-selected",
                node.hasDiagnostics && "has-diagnostics",
                rowClassName,
              )}
              style={getStructureTreeRowStyle({ depth, indentUnitCount })}
              onClick={() => onSelectLine?.(node.lineNumber)}
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
                depth={depth + 1}
                getRowProps={getRowProps}
                indentUnitCount={indentUnitCount}
                nodes={node.children}
                selectedLineNumbers={selectedLineNumbers}
                selectedRootLineNumber={selectedRootLineNumber}
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
