import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
} from "lucide-react";
import type {
  DragEvent,
  ReactNode,
} from "react";
import {
  BlockText,
  type DisplayText,
} from "./blockText";
import { cx } from "./primitives";

export type TreeDropPlacement = "after" | "before" | "inside";

export type TreeBlockNode = {
  children: TreeBlockNode[];
  hasDiagnostics: boolean;
  id: string;
  label: string;
  lineLabel: string;
  lineNumber: number;
  textDisplay: DisplayText;
};

export type TreeNode =
  | {
      canDrag: boolean;
      childCount?: number;
      children: TreeNode[];
      folderId: string;
      id: string;
      kind: "folder";
      parentFolderId: string | null;
      title: string;
    }
  | {
      canDrag: boolean;
      folderId: string | null;
      id: string;
      kind: "note";
      noteId: string;
      parentFolderId: string | null;
      title: string;
    };

export type TreeNodeReference =
  | {
      folderId: string;
      kind: "folder";
      parentFolderId: string | null;
    }
  | {
      kind: "note";
      noteId: string;
      parentFolderId: string | null;
    };

export type TreeMoveRequest = {
  placement: TreeDropPlacement;
  source: TreeNodeReference;
  target: TreeNodeReference;
};

export type NoteTreeAction = {
  label: string;
  onClick: () => void;
};

function getTreeNodeReference(node: TreeNode): TreeNodeReference {
  return node.kind === "folder"
    ? {
        folderId: node.folderId,
        kind: "folder",
        parentFolderId: node.parentFolderId,
      }
    : {
        kind: "note",
        noteId: node.noteId,
        parentFolderId: node.parentFolderId,
      };
}

function readTreeNodeReference(value: string): TreeNodeReference | null {
  try {
    const parsed = JSON.parse(value) as TreeNodeReference;

    return parsed.kind === "folder" || parsed.kind === "note" ? parsed : null;
  } catch {
    return null;
  }
}

export function BlockTree({
  activeLineNumber,
  activeLineNumbers,
  className,
  dragDataType,
  draggingLineNumber,
  draggable = false,
  getDragPayload,
  nodes,
  selectedRootLineNumber,
  onDragEnd,
  onDragStart,
  onSelectLine,
}: {
  activeLineNumber?: number | null;
  activeLineNumbers?: ReadonlySet<number>;
  className?: string;
  dragDataType?: string;
  draggingLineNumber?: string | null;
  draggable?: boolean;
  getDragPayload?: (lineNumber: number) => string;
  nodes: TreeBlockNode[];
  selectedRootLineNumber?: number | null;
  onDragEnd?: () => void;
  onDragStart?: (
    lineNumber: number,
    event: DragEvent<HTMLButtonElement>,
  ) => void;
  onSelectLine?: (lineNumber: number) => void;
}) {
  return (
    <ul className={cx("ui-tree", className)}>
      {nodes.map((node) => {
        const isSelected =
          activeLineNumber === node.lineNumber ||
          activeLineNumbers?.has(node.lineNumber) === true;
        const payload = getDragPayload?.(node.lineNumber) ?? String(node.lineNumber);

        return (
          <li key={node.id}>
            <button
              className={cx(
                "ui-tree-row ui-tree-block",
                isSelected && "is-selected is-selected-subtree",
                selectedRootLineNumber === node.lineNumber && "is-selected-root",
                draggingLineNumber === String(node.lineNumber) && "is-dragging",
                node.hasDiagnostics && "has-diagnostics",
              )}
              draggable={draggable}
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
              <span className="ui-tree-kind">{node.label}</span>
              <BlockText text={node.textDisplay} />
              <span className="ui-tree-meta">{node.lineLabel}</span>
            </button>
            {node.children.length > 0 ? (
              <BlockTree
                activeLineNumber={activeLineNumber}
                activeLineNumbers={activeLineNumbers}
                dragDataType={dragDataType}
                draggingLineNumber={draggingLineNumber}
                draggable={draggable}
                getDragPayload={getDragPayload}
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

export function OutlineTree({
  nodes,
  onSelectLine,
}: {
  nodes: TreeBlockNode[];
  onSelectLine: (lineNumber: number) => void;
}) {
  return <BlockTree nodes={nodes} onSelectLine={onSelectLine} />;
}

export function NoteTree({
  activeNoteId,
  actions,
  activeFolderId,
  className,
  nodes,
  renderNoteBadges,
  onMoveNode,
  onSelectFolder,
  onSelectNote,
}: {
  activeFolderId?: string | null;
  activeNoteId?: string | null;
  actions?: (node: TreeNode) => NoteTreeAction[];
  className?: string;
  nodes: TreeNode[];
  renderNoteBadges?: (node: Extract<TreeNode, { kind: "note" }>) => ReactNode;
  onMoveNode?: (request: TreeMoveRequest) => void;
  onSelectFolder?: (folderId: string) => void;
  onSelectNote?: (noteId: string) => void;
}) {
  return (
    <ul className={cx("ui-tree", className)}>
      {nodes.map((node) => {
        const nodeActions = actions?.(node) ?? [];
        const nodeReference = getTreeNodeReference(node);
        const isActive =
          node.kind === "note"
            ? activeNoteId === node.noteId
            : activeFolderId === node.folderId;

        return (
          <li key={node.id}>
            <div
              className={cx("ui-tree-row-frame", isActive && "is-selected")}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const source = readTreeNodeReference(
                  event.dataTransfer.getData("application/x-cognition-tree-node"),
                );

                if (source) {
                  onMoveNode?.({
                    placement: node.kind === "folder" ? "inside" : "after",
                    source,
                    target: nodeReference,
                  });
                }
              }}
            >
              <button
                className="ui-tree-row ui-tree-note"
                draggable={node.canDrag}
                onClick={() =>
                  node.kind === "note"
                    ? onSelectNote?.(node.noteId)
                    : onSelectFolder?.(node.folderId)
                }
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "application/x-cognition-tree-node",
                    JSON.stringify(nodeReference),
                  );
                }}
                title={node.title}
                type="button"
              >
                {node.kind === "folder" ? (
                  <>
                    {node.children.length > 0 ? (
                      <ChevronDown aria-hidden="true" size={13} />
                    ) : (
                      <ChevronRight aria-hidden="true" size={13} />
                    )}
                    <Folder aria-hidden="true" size={13} />
                  </>
                ) : (
                  <FileText aria-hidden="true" size={13} />
                )}
                <span className="ui-tree-text">{node.title}</span>
                {node.kind === "note" ? renderNoteBadges?.(node) : null}
              </button>
              {nodeActions.length > 0 ? (
                <span className="ui-tree-actions">
                  {nodeActions.map((action) => (
                    <button key={action.label} onClick={action.onClick} type="button">
                      {action.label}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
            {node.kind === "folder" && node.children.length > 0 ? (
              <NoteTree
                activeFolderId={activeFolderId}
                activeNoteId={activeNoteId}
                actions={actions}
                nodes={node.children}
                renderNoteBadges={renderNoteBadges}
                onMoveNode={onMoveNode}
                onSelectFolder={onSelectFolder}
                onSelectNote={onSelectNote}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
