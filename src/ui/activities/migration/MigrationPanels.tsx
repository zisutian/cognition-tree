import {
  ChevronDown,
  ChevronRight,
  FileInput,
  FileOutput,
  FileText,
  Folder,
  GitBranch,
} from "lucide-react";
import {
  useEffect,
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
  Button,
  EmptyState,
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

const emptySelectedLineNumbers = new Set<number>();

type MigrationDirectoryMode = "pair" | "structure";
type MigrationDirectoryNoteStatus = "source" | "structure" | "target" | "";
type MigrationPairSelectionPhase = "selectSource" | "selectTarget";

export function getMigrationDirectoryNoteStatus({
  mode,
  noteId,
  pairSelectionPhase,
  pendingSourceNoteId,
  sourceNoteId,
  structureNoteId,
  targetNoteId,
}: {
  mode: MigrationDirectoryMode;
  noteId: string;
  pairSelectionPhase: MigrationPairSelectionPhase;
  pendingSourceNoteId: string | null;
  sourceNoteId: string;
  structureNoteId: string;
  targetNoteId: string;
}) {
  if (mode === "structure") {
    return noteId === structureNoteId ? "structure" : "";
  }

  const activeSourceNoteId =
    pairSelectionPhase === "selectTarget"
      ? pendingSourceNoteId ?? sourceNoteId
      : sourceNoteId;

  if (noteId === activeSourceNoteId) {
    return "source";
  }

  return pairSelectionPhase === "selectSource" && noteId === targetNoteId
    ? "target"
    : "";
}

function MigrationDirectoryStatusIcon({
  status,
}: {
  status: Exclude<MigrationDirectoryNoteStatus, "">;
}) {
  const iconProps = {
    "aria-hidden": true,
    size: 13,
    strokeWidth: 2,
  };
  const labelByStatus = {
    source: "源笔记",
    structure: "笔记结构",
    target: "目标笔记",
  };

  return (
    <span
      aria-label={labelByStatus[status]}
      className="ui-tree-status"
      title={labelByStatus[status]}
    >
      {status === "source" ? <FileOutput {...iconProps} /> : null}
      {status === "target" ? <FileInput {...iconProps} /> : null}
      {status === "structure" ? <GitBranch {...iconProps} /> : null}
    </span>
  );
}

export function canPairMigrationDirectoryNodes(
  source: TreeMoveRequest["source"],
  target: TreeMoveRequest["target"],
) {
  return source.kind === "note" && target.kind === "note";
}

function promptText(label: string, value = "") {
  return window.prompt(label, value)?.trim() ?? "";
}

function findNoteTitle(nodes: TreeNode[], noteId: string): string | null {
  for (const node of nodes) {
    if (node.kind === "note" && node.noteId === noteId) {
      return node.title;
    }

    if (node.kind === "folder") {
      const title = findNoteTitle(node.children, noteId);

      if (title) {
        return title;
      }
    }
  }

  return null;
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
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pairSelectionPhase, setPairSelectionPhase] =
    useState<MigrationPairSelectionPhase>("selectSource");
  const [pendingSourceNoteId, setPendingSourceNoteId] = useState<string | null>(
    null,
  );
  const resetPairSelection = () => {
    setPairSelectionPhase("selectSource");
    setPendingSourceNoteId(null);
  };
  const moveNode = (request: TreeMoveRequest) => {
    if (request.source.kind !== "note" || request.target.kind !== "note") {
      return;
    }

    view.migration.onPairNotesForMigration(
      request.source.noteId,
      request.target.noteId,
    );
    resetPairSelection();
  };
  const actions = (node: TreeNode) =>
    node.kind === "folder"
      ? [
          {
            label: "改",
            onClick: () => {
              const title = promptText("文件夹名称", node.title);

              if (title) {
                view.renameFolder(node.folderId, title);
              }
            },
          },
          {
            label: "删",
            onClick: () => view.deleteFolder(node.folderId),
          },
        ]
      : [
          {
            label: "改",
            onClick: () => {
              const title = promptText("笔记名称", node.title);

              if (title) {
                view.renameNote(node.noteId, title);
              }
            },
          },
          {
            label: "删",
            onClick: () => view.deleteNote(node.noteId),
          },
        ];
  const toggleFolder = (folderId: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);

      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };
  const selectNote = (noteId: string) => {
    if (view.migration.mode === "structure") {
      view.migration.onSelectStructureNote(noteId);
      return;
    }

    if (pairSelectionPhase === "selectTarget") {
      const sourceNoteId = pendingSourceNoteId ?? view.migration.sourceNoteId;

      if (noteId === sourceNoteId) {
        return;
      }

      view.migration.onPairNotesForMigration(sourceNoteId, noteId);
      resetPairSelection();
      return;
    }

    view.migration.onSelectMigrationSourceNote(noteId);
    setPendingSourceNoteId(noteId);
    setPairSelectionPhase("selectTarget");
  };
  const getNoteStatus = (node: Extract<TreeNode, { kind: "note" }>) => {
    return getMigrationDirectoryNoteStatus({
      mode: view.migration.mode,
      noteId: node.noteId,
      pairSelectionPhase,
      pendingSourceNoteId,
      sourceNoteId: view.migration.sourceNoteId,
      structureNoteId: view.migration.structureNoteId,
      targetNoteId: view.migration.targetNoteId,
    });
  };
  const renderNodeLeading = (
    node: TreeNode,
    state: { hasChildren: boolean; isCollapsed: boolean },
  ) => {
    if (node.kind === "folder") {
      return (
        <>
          {state.hasChildren ? (
            state.isCollapsed ? (
              <ChevronRight aria-hidden="true" size={13} />
            ) : (
              <ChevronDown aria-hidden="true" size={13} />
            )
          ) : (
            <span aria-hidden="true" className="ui-tree-toggle-spacer" />
          )}
          <Folder aria-hidden="true" size={13} />
        </>
      );
    }

    const status = getNoteStatus(node);

    return (
      <>
        <span aria-hidden="true" className="ui-tree-toggle-spacer" />
        {status ? (
          <MigrationDirectoryStatusIcon status={status} />
        ) : (
          <FileText aria-hidden="true" size={13} />
        )}
      </>
    );
  };
  const pendingSourceTitle = pendingSourceNoteId
    ? findNoteTitle(view.migration.noteTree, pendingSourceNoteId) ??
      view.migration.sourceNote?.title ??
      "未选择"
    : (view.migration.sourceNote?.title ?? "未选择");
  const activeNoteId =
    view.migration.mode === "structure"
      ? view.migration.structureNoteId
      : pairSelectionPhase === "selectTarget"
        ? pendingSourceNoteId ?? view.migration.sourceNoteId
        : view.migration.sourceNoteId;
  const statusText =
    view.migration.mode === "structure"
      ? `点选笔记结构 · ${view.migration.structureNote?.title ?? "未选择"}`
      : pairSelectionPhase === "selectTarget"
        ? [`已选源笔记 ${pendingSourceTitle}`, "点选或拖到目标笔记"].join(
            " · ",
          )
        : [
            "点选源笔记",
            `当前源笔记 ${view.migration.sourceNote?.title ?? "未选择"}`,
            `目标笔记 ${view.migration.targetNote?.title ?? "未选择"}`,
          ].join(" · ");

  return (
    <div className="activity-context-content">
      <p className="context-caption">{statusText}</p>
      <div className="migration-mode-switch" aria-label="迁移模式" role="group">
        <Button
          className={view.migration.mode === "pair" ? "is-active" : undefined}
          onClick={() => {
            view.migration.onSetMigrationMode("pair");
            resetPairSelection();
          }}
          type="button"
        >
          源笔记 / 目标笔记
        </Button>
        <Button
          className={
            view.migration.mode === "structure" ? "is-active" : undefined
          }
          onClick={() => {
            view.migration.onSetMigrationMode("structure");
            resetPairSelection();
          }}
          type="button"
        >
          笔记结构
        </Button>
      </div>
      <NoteTree
        actions={actions}
        activeNode={activeNoteId ? { kind: "note", noteId: activeNoteId } : null}
        canDragNode={(node) => node.kind === "note"}
        canDropNode={canPairMigrationDirectoryNodes}
        collapsedFolderIds={collapsedFolderIds}
        nodes={view.migration.noteTree}
        renderNodeLeading={renderNodeLeading}
        onMoveNode={moveNode}
        onSelectNote={selectNote}
        onToggleFolder={toggleFolder}
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
  useEffect(() => {
    setSourceLineNumber("");
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
  }, [view.migration.sourceNoteId, view.migration.targetNoteId]);
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
        title={`源笔记 · ${view.migration.sourceNote?.title ?? "未选择"}`}
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
        title={`目标笔记 · ${view.migration.targetNote?.title ?? "未选择"}`}
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
            selectedLineNumbers={emptySelectedLineNumbers}
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
  useEffect(() => {
    setSelectedLineNumber("");
    setDraggingLineNumber(null);
    setActiveDropPosition(null);
    setActiveTargetLineNumber(null);
  }, [view.migration.mode, view.migration.structureNoteId]);
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
        title={`笔记结构 · ${view.migration.structureNote?.title ?? "未选择"}`}
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
          <p className="ui-muted">当前笔记结构没有可调整块。</p>
        )}
      </Section>
    </div>
  );
}

export function MigrationMainPanel({ view }: { view: ViewModel }) {
  if (view.migration.noteTree.length === 0) {
    return (
      <Panel className="migration-panel" aria-label="结构操作">
        <EmptyState description="没有可操作笔记。" title="结构操作" />
      </Panel>
    );
  }

  return (
    <Panel className="migration-panel" aria-label="结构操作">
      <PanelHeader title="结构操作" />
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
