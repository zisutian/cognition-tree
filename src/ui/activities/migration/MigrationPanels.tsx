import {
  useMemo,
  useState,
  type DragEvent,
} from "react";
import {
  flattenUiBlockSubtree,
  type UiBlockNode,
} from "../../../application/workspace/projection/viewBlocks";
import type { ViewModel } from "../../../application/workspace/view-model/useViewModel";
import { BlockText } from "../../shared/blockText";
import {
  EmptyState,
  Metrics,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
  cx,
} from "../../shared/primitives";
import {
  BlockTree,
  NoteTree,
  type TreeMoveRequest,
  type TreeNode,
} from "../../shared/tree";
import {
  blockLineDragDataType,
  createBlockLineDragPayload,
  readBlockLineDragPayload,
} from "./blockLineDrag";

function findBlockByLineNumber(blocks: UiBlockNode[], lineNumberValue: string) {
  return (
    blocks.find((block) => String(block.lineNumber) === lineNumberValue) ?? null
  );
}

function useSelectedBlockLines(block: UiBlockNode | null) {
  return useMemo(() => {
    if (!block) {
      return new Set<number>();
    }

    return new Set(
      flattenUiBlockSubtree(block).map((subtreeBlock) => subtreeBlock.lineNumber),
    );
  }, [block]);
}

function readDraggedLine(event: DragEvent<HTMLElement>) {
  return readBlockLineDragPayload({
    plainText: event.dataTransfer.getData("text/plain"),
    typedPayload: event.dataTransfer.getData(blockLineDragDataType),
  });
}

function DropTarget({
  activePosition,
  label,
  position,
  onDropLine,
  onSetActivePosition,
}: {
  activePosition: string | null;
  label: string;
  position: string;
  onDropLine: (lineNumber: string, position: string) => void;
  onSetActivePosition: (position: string | null) => void;
}) {
  return (
    <div
      className={cx(
        "migration-drop-target",
        activePosition === position && "is-active",
      )}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;

        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }

        onSetActivePosition(null);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onSetActivePosition(position);
      }}
      onDrop={(event) => {
        const lineNumber = readDraggedLine(event);

        event.preventDefault();
        onSetActivePosition(null);

        if (lineNumber) {
          onDropLine(lineNumber, position);
        }
      }}
    >
      {label}
    </div>
  );
}

function MovingTargetTree({
  activeDropPosition,
  activeTargetLineNumber,
  draggingLineNumber,
  draggable = false,
  nodes,
  selectedLineNumbers,
  selectedRootLineNumber,
  onActivateTarget,
  onDragEnd,
  onDragStartLine,
  onDropLine,
  onSelectLine,
  onSetActiveDropPosition,
}: {
  activeDropPosition: string | null;
  activeTargetLineNumber: number | null;
  draggingLineNumber: string | null;
  draggable?: boolean;
  nodes: UiBlockNode[];
  selectedLineNumbers: ReadonlySet<number>;
  selectedRootLineNumber: number | null;
  onActivateTarget: (lineNumber: number | null) => void;
  onDragEnd?: () => void;
  onDragStartLine?: (lineNumber: number) => void;
  onDropLine: (lineNumber: string, position: string) => void;
  onSelectLine?: (lineNumber: number) => void;
  onSetActiveDropPosition: (position: string | null) => void;
}) {
  return (
    <ul className="ui-tree migration-target-tree">
      {nodes.map((node) => {
        const isSelected = selectedLineNumbers.has(node.lineNumber);
        const isActiveTarget =
          draggingLineNumber !== null &&
          activeTargetLineNumber === node.lineNumber &&
          !isSelected;

        return (
          <li key={node.id}>
            {isActiveTarget ? (
              <DropTarget
                activePosition={activeDropPosition}
                label="上方并列"
                position={`sibling-above:${node.lineNumber}`}
                onDropLine={onDropLine}
                onSetActivePosition={onSetActiveDropPosition}
              />
            ) : null}
            <button
              className={cx(
                "ui-tree-row ui-tree-block migration-target-node",
                isSelected && "is-selected is-selected-subtree",
                selectedRootLineNumber === node.lineNumber && "is-selected-root",
                draggingLineNumber === String(node.lineNumber) && "is-dragging",
                isActiveTarget && "is-position-source",
                node.hasDiagnostics && "has-diagnostics",
              )}
              draggable={draggable}
              onClick={() => onSelectLine?.(node.lineNumber)}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                if (!draggingLineNumber || isSelected) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onActivateTarget(node.lineNumber);
                onSetActiveDropPosition(null);
              }}
              onDragStart={(event) => {
                const payload = createBlockLineDragPayload(node.lineNumber);

                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(blockLineDragDataType, payload);
                event.dataTransfer.setData("text/plain", payload);
                onDragStartLine?.(node.lineNumber);
              }}
              title={`${node.label}: ${node.textDisplay.displayText}`}
              type="button"
            >
              <span className="ui-tree-kind">{node.label}</span>
              <BlockText text={node.textDisplay} />
              <span className="ui-tree-meta">{node.lineLabel}</span>
            </button>
            {node.children.length > 0 ? (
              <MovingTargetTree
                activeDropPosition={activeDropPosition}
                activeTargetLineNumber={activeTargetLineNumber}
                draggingLineNumber={draggingLineNumber}
                draggable={draggable}
                nodes={node.children}
                selectedLineNumbers={selectedLineNumbers}
                selectedRootLineNumber={selectedRootLineNumber}
                onActivateTarget={onActivateTarget}
                onDragEnd={onDragEnd}
                onDragStartLine={onDragStartLine}
                onDropLine={onDropLine}
                onSelectLine={onSelectLine}
                onSetActiveDropPosition={onSetActiveDropPosition}
              />
            ) : null}
            {isActiveTarget ? (
              <DropTarget
                activePosition={activeDropPosition}
                label="作为子结点"
                position={`inside:${node.lineNumber}`}
                onDropLine={onDropLine}
                onSetActivePosition={onSetActiveDropPosition}
              />
            ) : null}
            {isActiveTarget ? (
              <DropTarget
                activePosition={activeDropPosition}
                label="下方并列"
                position={`sibling-below:${node.lineNumber}`}
                onDropLine={onDropLine}
                onSetActivePosition={onSetActiveDropPosition}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function MigrationContext({ view }: { view: ViewModel }) {
  const moveNode = (request: TreeMoveRequest) => {
    if (request.source.kind !== "note" || request.target.kind !== "note") {
      return;
    }

    view.migration.onPairNotesForMigration(
      request.source.noteId,
      request.target.noteId,
    );
  };
  const noteBadges = (node: Extract<TreeNode, { kind: "note" }>) => (
    <>
      {node.noteId === view.migration.sourceNoteId ? (
        <span className="ui-badge">源</span>
      ) : null}
      {node.noteId === view.migration.structureNoteId ? (
        <span className="ui-badge">结构</span>
      ) : null}
      {node.noteId === view.migration.targetNoteId ? (
        <span className="ui-badge">目标</span>
      ) : null}
    </>
  );
  const actions = (node: TreeNode) =>
    node.kind === "note"
      ? [
          {
            label: "结构",
            onClick: () => view.migration.onOpenNoteStructure(node.noteId),
          },
        ]
      : [];

  return (
    <div className="activity-context-content">
      <p className="context-caption">拖动笔记到另一个笔记形成迁移配对。</p>
      <NoteTree
        activeNoteId={
          view.migration.mode === "structure"
            ? view.migration.structureNoteId
            : view.migration.sourceNoteId
        }
        actions={actions}
        nodes={view.migration.noteTree}
        renderNoteBadges={noteBadges}
        onMoveNode={moveNode}
        onSelectNote={view.migration.onOpenNoteStructure}
      />
    </div>
  );
}

function MigrationPairView({ view }: { view: ViewModel }) {
  const [sourceLineNumber, setSourceLineNumber] = useState("");
  const [draggingLineNumber, setDraggingLineNumber] = useState<string | null>(
    null,
  );
  const [activeDropPosition, setActiveDropPosition] = useState<string | null>(
    null,
  );
  const [activeTargetLineNumber, setActiveTargetLineNumber] = useState<
    number | null
  >(null);
  const sourceBlock = findBlockByLineNumber(
    view.migration.sourceBlocks,
    sourceLineNumber,
  );
  const selectedLineNumbers = useSelectedBlockLines(sourceBlock);
  const finishDrag = () => {
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
  };
  const startDrag = (lineNumber: number) => {
    const lineNumberValue = String(lineNumber);

    setDraggingLineNumber(lineNumberValue);
    setSourceLineNumber(lineNumberValue);
  };
  const dropLine = (lineNumber: string, position: string) => {
    setSourceLineNumber(lineNumber);
    view.migration.onMoveBlockToPosition(lineNumber, position);
    finishDrag();
  };

  return (
    <div className="migration-grid">
      <Section
        className="migration-column"
        title={`源 · ${view.migration.sourceNote?.title ?? "未选择"}`}
      >
        {view.migration.sourceRoots.length > 0 ? (
          <BlockTree
            activeLineNumbers={selectedLineNumbers}
            dragDataType={blockLineDragDataType}
            draggingLineNumber={draggingLineNumber}
            draggable
            getDragPayload={createBlockLineDragPayload}
            nodes={view.migration.sourceRoots}
            selectedRootLineNumber={sourceBlock?.lineNumber ?? null}
            onDragEnd={finishDrag}
            onDragStart={startDrag}
            onSelectLine={(lineNumber) => setSourceLineNumber(String(lineNumber))}
          />
        ) : (
          <p className="ui-muted">源笔记没有可移动块。</p>
        )}
      </Section>
      <Section
        className="migration-column"
        title={`目标 · ${view.migration.targetNote?.title ?? "未选择"}`}
      >
        {draggingLineNumber ? (
          <DropTarget
            activePosition={activeDropPosition}
            label="文末根块"
            position="end"
            onDropLine={dropLine}
            onSetActivePosition={setActiveDropPosition}
          />
        ) : null}
        {view.migration.targetRoots.length > 0 ? (
          <MovingTargetTree
            activeDropPosition={activeDropPosition}
            activeTargetLineNumber={activeTargetLineNumber}
            draggingLineNumber={draggingLineNumber}
            nodes={view.migration.targetRoots}
            selectedLineNumbers={selectedLineNumbers}
            selectedRootLineNumber={null}
            onActivateTarget={setActiveTargetLineNumber}
            onDropLine={dropLine}
            onSetActiveDropPosition={setActiveDropPosition}
          />
        ) : (
          <p className="ui-muted">目标笔记没有结构。</p>
        )}
      </Section>
    </div>
  );
}

function StructureView({ view }: { view: ViewModel }) {
  const [selectedLineNumber, setSelectedLineNumber] = useState("");
  const [draggingLineNumber, setDraggingLineNumber] = useState<string | null>(
    null,
  );
  const [activeDropPosition, setActiveDropPosition] = useState<string | null>(
    null,
  );
  const [activeTargetLineNumber, setActiveTargetLineNumber] = useState<
    number | null
  >(null);
  const selectedBlock = findBlockByLineNumber(
    view.migration.structureBlocks,
    selectedLineNumber,
  );
  const selectedLineNumbers = useSelectedBlockLines(selectedBlock);
  const finishDrag = () => {
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
  };
  const startDrag = (lineNumber: number) => {
    const lineNumberValue = String(lineNumber);

    setDraggingLineNumber(lineNumberValue);
    setSelectedLineNumber(lineNumberValue);
  };
  const dropLine = (lineNumber: string, position: string) => {
    view.migration.onMoveStructureBlock(lineNumber, position);
    setSelectedLineNumber("");
    finishDrag();
  };

  return (
    <div className="migration-grid migration-grid-single">
      <Section
        className="migration-column"
        title={`结构 · ${view.migration.structureNote?.title ?? "未选择"}`}
      >
        {draggingLineNumber ? (
          <DropTarget
            activePosition={activeDropPosition}
            label="文末根块"
            position="end"
            onDropLine={dropLine}
            onSetActivePosition={setActiveDropPosition}
          />
        ) : null}
        {view.migration.structureRoots.length > 0 ? (
          <MovingTargetTree
            activeDropPosition={activeDropPosition}
            activeTargetLineNumber={activeTargetLineNumber}
            draggingLineNumber={draggingLineNumber}
            draggable
            nodes={view.migration.structureRoots}
            selectedLineNumbers={selectedLineNumbers}
            selectedRootLineNumber={selectedBlock?.lineNumber ?? null}
            onActivateTarget={setActiveTargetLineNumber}
            onDragEnd={finishDrag}
            onDragStartLine={startDrag}
            onDropLine={dropLine}
            onSelectLine={(lineNumber) =>
              setSelectedLineNumber(String(lineNumber))
            }
            onSetActiveDropPosition={setActiveDropPosition}
          />
        ) : (
          <p className="ui-muted">当前笔记没有可调整块。</p>
        )}
      </Section>
    </div>
  );
}

export function MigrationMainPanel({ view }: { view: ViewModel }) {
  if (view.migration.noteTree.length === 0) {
    return (
      <Panel className="migration-panel" aria-label="块迁移">
        <EmptyState description="没有可迁移笔记。" title="块迁移" />
      </Panel>
    );
  }

  return (
    <Panel className="migration-panel" aria-label="块迁移">
      <PanelHeader
        title={view.migration.mode === "structure" ? "笔记结构调整" : "块迁移"}
        actions={
          <Metrics
            items={[
              { label: "源块", value: view.migration.sourceBlocks.length },
              { label: "目标块", value: view.migration.targetRoots.length },
              { label: "结构块", value: view.migration.structureBlocks.length },
            ]}
          />
        }
      />
      <PanelBody className={cx("migration-body", view.migration.mode)}>
        {view.migration.mode === "structure" ? (
          <StructureView view={view} />
        ) : (
          <MigrationPairView view={view} />
        )}
      </PanelBody>
    </Panel>
  );
}
