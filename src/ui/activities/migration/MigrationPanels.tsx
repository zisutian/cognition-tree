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
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
  SegmentedControl,
  SymbolSlot,
  cx,
} from "../../shared/primitives";
import {
  NoteTree,
  StructureTree,
  StructureTreeRowContent,
  getStructureTreeRowStyle,
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

function readPositiveLineNumber(value: string | null) {
  const lineNumber = Number(value);

  return Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : null;
}

export function canDropStructureBlockOnLine({
  blockedLineNumbers,
  draggingLineNumber,
  targetLineNumber,
}: {
  blockedLineNumbers: ReadonlySet<number>;
  draggingLineNumber: string | null;
  targetLineNumber: number;
}) {
  return (
    readPositiveLineNumber(draggingLineNumber) !== null &&
    !blockedLineNumbers.has(targetLineNumber)
  );
}

export function canDropStructureBlockAtEnd(draggingLineNumber: string | null) {
  return readPositiveLineNumber(draggingLineNumber) !== null;
}

export function getStructureRowDropPlacement({
  clientY,
  height,
  top,
}: {
  clientY: number;
  height: number;
  top: number;
}): StructureRowDropPlacement {
  const rowHeight = Math.max(1, height);
  const offsetY = Math.max(0, Math.min(rowHeight, clientY - top));

  if (offsetY < rowHeight / 3) {
    return "sibling-above";
  }

  if (offsetY > (rowHeight * 2) / 3) {
    return "sibling-below";
  }

  return "inside";
}

export function getStructureBlockDropPosition(
  targetLineNumber: number,
  placement: StructureRowDropPlacement,
) {
  return placement === "inside"
    ? `inside:${targetLineNumber}`
    : `${placement}:${targetLineNumber}`;
}

export function getBlockedStructureDropLineNumbers(block: UiBlockNode | null) {
  return new Set(
    block ? flattenUiBlockSubtree(block).map((node) => node.lineNumber) : [],
  );
}

const emptySelectedLineNumbers = new Set<number>();

type MigrationDirectoryMode = "pair" | "structure";
type MigrationDirectoryNoteStatus = "source" | "structure" | "target" | "";
type MigrationPairSelectionPhase = "selectSource" | "selectTarget";
type StructureRowDropPlacement = "inside" | "sibling-above" | "sibling-below";

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
    <SymbolSlot
      aria-label={labelByStatus[status]}
      className="ui-tree-status"
      title={labelByStatus[status]}
      tone="strong"
    >
      {status === "source" ? <FileOutput {...iconProps} /> : null}
      {status === "target" ? <FileInput {...iconProps} /> : null}
      {status === "structure" ? <GitBranch {...iconProps} /> : null}
    </SymbolSlot>
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
        event.stopPropagation();
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

function readStructureRowDropPosition(
  event: DragEvent<HTMLButtonElement>,
  targetLineNumber: number,
) {
  const rect = event.currentTarget.getBoundingClientRect();

  return getStructureBlockDropPosition(
    targetLineNumber,
    getStructureRowDropPlacement({
      clientY: event.clientY,
      height: rect.height,
      top: rect.top,
    }),
  );
}

function MovingTargetTree({
  activeDropPosition,
  activeTargetLineNumber,
  blockedLineNumbers,
  depth = 0,
  draggingLineNumber,
  draggable = false,
  indentUnitCount,
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
  blockedLineNumbers: ReadonlySet<number>;
  depth?: number;
  draggingLineNumber: string | null;
  draggable?: boolean;
  indentUnitCount?: number;
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
    <ul className="ui-tree ui-structure-tree migration-target-tree">
      {nodes.map((node) => {
        const isSelected = selectedLineNumbers.has(node.lineNumber);
        const canDropOnNode = canDropStructureBlockOnLine({
          blockedLineNumbers,
          draggingLineNumber,
          targetLineNumber: node.lineNumber,
        });
        const isActiveTarget =
          draggingLineNumber !== null &&
          activeTargetLineNumber === node.lineNumber &&
          canDropOnNode;
        const activePlacement = isActiveTarget
          ? activeDropPosition?.split(":")[0]
          : null;

        return (
          <li key={node.id}>
            <button
              className={cx(
                "ui-tree-row ui-structure-tree-row migration-target-node",
                isSelected && "is-selected is-selected-subtree",
                selectedRootLineNumber === node.lineNumber && "is-selected-root",
                draggingLineNumber === String(node.lineNumber) && "is-dragging",
                isActiveTarget && "is-position-source is-drop-target",
                activePlacement === "sibling-above" && "is-drop-above",
                activePlacement === "inside" && "is-drop-inside",
                activePlacement === "sibling-below" && "is-drop-below",
                node.hasDiagnostics && "has-diagnostics",
              )}
              data-structure-row-drop="true"
              draggable={draggable}
              style={getStructureTreeRowStyle({ depth, indentUnitCount })}
              onClick={() => onSelectLine?.(node.lineNumber)}
              onDragEnd={onDragEnd}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget;

                if (
                  nextTarget instanceof Node &&
                  event.currentTarget.contains(nextTarget)
                ) {
                  return;
                }

                onActivateTarget(null);
                onSetActiveDropPosition(null);
              }}
              onDragOver={(event) => {
                if (!canDropOnNode) {
                  event.dataTransfer.dropEffect = "none";
                  return;
                }

                const dropPosition = readStructureRowDropPosition(
                  event,
                  node.lineNumber,
                );

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onActivateTarget(node.lineNumber);
                onSetActiveDropPosition(dropPosition);
              }}
              onDrop={(event) => {
                if (!canDropOnNode) {
                  return;
                }

                const lineNumber = readDraggedLine(event);
                const dropPosition = readStructureRowDropPosition(
                  event,
                  node.lineNumber,
                );

                event.preventDefault();
                event.stopPropagation();
                onActivateTarget(null);
                onSetActiveDropPosition(null);

                if (lineNumber) {
                  onDropLine(lineNumber, dropPosition);
                }
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
              <StructureTreeRowContent
                label={node.label}
                lineLabel={node.lineLabel}
                textDisplay={node.textDisplay}
              />
            </button>
            {node.children.length > 0 ? (
              <MovingTargetTree
                activeDropPosition={activeDropPosition}
                activeTargetLineNumber={activeTargetLineNumber}
                blockedLineNumbers={blockedLineNumbers}
                depth={depth + 1}
                draggingLineNumber={draggingLineNumber}
                draggable={draggable}
                indentUnitCount={indentUnitCount}
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
      <SegmentedControl
        ariaLabel="迁移模式"
        fill
        options={[
          { label: "源笔记 / 目标笔记", value: "pair" },
          { label: "笔记结构", value: "structure" },
        ]}
        value={view.migration.mode}
        onChange={(nextMode) => {
          view.migration.onSetMigrationMode(nextMode);
          resetPairSelection();
        }}
      />
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
          <StructureTree
            activeLineNumbers={selectedLineNumbers}
            dragDataType={blockLineDragDataType}
            draggingLineNumber={draggingLineNumber}
            draggable
            getDragPayload={createBlockLineDragPayload}
            indentUnitCount={view.editor.syntaxProfile.tabDisplayWidth}
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
        {draggingLineNumber && view.migration.targetRoots.length === 0 ? (
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
            blockedLineNumbers={emptySelectedLineNumbers}
            draggingLineNumber={draggingLineNumber}
            indentUnitCount={view.editor.syntaxProfile.tabDisplayWidth}
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
    draggingLineNumber ?? selectedLineNumber,
  );
  const selectedLineNumbers = useSelectedBlockLines(selectedBlock);
  const blockedLineNumbers = useMemo(
    () => getBlockedStructureDropLineNumbers(selectedBlock),
    [selectedBlock],
  );
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
        {canDropStructureBlockAtEnd(draggingLineNumber) &&
        view.migration.structureRoots.length === 0 ? (
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
            blockedLineNumbers={blockedLineNumbers}
            draggingLineNumber={draggingLineNumber}
            draggable
            indentUnitCount={view.editor.syntaxProfile.tabDisplayWidth}
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
