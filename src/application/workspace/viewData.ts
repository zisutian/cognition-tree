import {
  configurableSyntaxTones,
  getSyntaxTextColorClassName,
  getSyntaxToneClassName,
  isCustomSyntaxTone,
} from "../../ctn/syntax/tones";
import type {
  CtnBlock,
  CtnDocument,
  OutlineNode,
} from "../../ctn/parser/types";
import type {
  CtnRuleRole,
  CtnSyntaxProfile,
  CtnSyntaxTone,
} from "../../ctn/syntax/types";
import {
  defaultFolderId,
  type NoteRecord,
  type NoteTreeNode,
} from "../../workspace/model/workspaceData";
import type { NoteReferenceGraph } from "../../workspace/queries/workspaceQueries";
import type { WorkspaceBlockMigrationTargetPositionRequest } from "../../workspace/commands/blockMigrationCommands";
import type {
  SyntaxProfileDraft,
  SyntaxProfileDraftBuildResult,
} from "../../ctn/syntax/profileDraft";
import type {
  UiBlockNode,
  UiEditorFocusTarget,
  UiEditorView,
  UiNoteSummary,
  UiOutlineNode,
  UiReferenceGraphView,
  UiSidebarView,
  UiSyntaxProfileDraft,
  UiSyntaxProfileDraftBuildResult,
  UiSyntaxProfileInlineRuleSummary,
  UiSyntaxProfileSummary,
  UiSyntaxRoleOption,
  UiSyntaxToneOption,
  UiSyntaxView,
  UiTextDisplay,
  UiTextSegment,
  UiToneStyle,
  UiTreeNode,
} from "./viewTypes";

const roleLabels: Record<CtnRuleRole, string> = {
  multiline: "多行块",
  normal: "普通块",
};

const syntaxRoleOptions: UiSyntaxRoleOption[] = [
  { label: roleLabels.normal, value: "normal" },
  { label: roleLabels.multiline, value: "multiline" },
];

export const syntaxToneOptions: UiSyntaxToneOption[] =
  configurableSyntaxTones.map((tone) => ({
    label: tone,
    value: tone,
  }));

function createToneStyle(
  tone: CtnSyntaxTone,
  textColor: CtnSyntaxTone,
): UiToneStyle | undefined {
  const style: UiToneStyle = {};

  if (isCustomSyntaxTone(tone)) {
    style["--ctn-tone-color"] = tone;
  }

  if (isCustomSyntaxTone(textColor)) {
    style["--ctn-text-color"] = textColor;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function getNodeTextStartIndex(node: OutlineNode) {
  let textStart = node.indentText.length;

  if (node.marker) {
    const markerStart = node.rawText.indexOf(node.marker, textStart);

    if (markerStart >= 0) {
      textStart = markerStart + node.marker.length;
    }
  }

  while (textStart < node.rawText.length && /\s/.test(node.rawText[textStart])) {
    textStart += 1;
  }

  return textStart;
}

function clampOffset(offset: number, textLength: number) {
  return Math.min(textLength, Math.max(0, offset));
}

function getInlineDisplayText(sourceText: string, parsedText: string) {
  if (!parsedText || sourceText === parsedText) {
    return sourceText;
  }

  const parsedTextStart = sourceText.indexOf(parsedText);

  return parsedTextStart >= 0 ? parsedText : sourceText;
}

export function createUiTextSegments(node: OutlineNode): UiTextSegment[] {
  const textStartColumn = getNodeTextStartIndex(node) + 1;
  const spans = [...node.inlineSpans].sort(
    (left, right) =>
      left.startColumn - right.startColumn || left.endColumn - right.endColumn,
  );
  const segments: UiTextSegment[] = [];
  let cursor = 0;

  spans.forEach((span) => {
    const spanStart = clampOffset(
      span.startColumn - textStartColumn,
      node.text.length,
    );
    const spanEnd = clampOffset(span.endColumn - textStartColumn, node.text.length);

    if (spanStart < cursor || spanStart >= spanEnd) {
      return;
    }

    if (cursor < spanStart) {
      segments.push({
        id: `${node.id}-text-${cursor}`,
        kind: "text",
        text: node.text.slice(cursor, spanStart),
      });
    }

    const sourceText = node.text.slice(spanStart, spanEnd);
    const displayText = getInlineDisplayText(sourceText, span.text);

    if (displayText) {
      segments.push({
        id: span.id,
        kind: "inline",
        text: displayText,
        textColorClassName: getSyntaxTextColorClassName(span.textColor),
        toneClassName: getSyntaxToneClassName(span.tone),
        style: createToneStyle(span.tone, span.textColor),
      });
    }

    cursor = spanEnd;
  });

  if (cursor < node.text.length) {
    segments.push({
      id: `${node.id}-text-${cursor}`,
      kind: "text",
      text: node.text.slice(cursor),
    });
  }

  return segments.length > 0
    ? segments
    : [{ id: `${node.id}-text-empty`, kind: "text", text: node.text }];
}

export function getUiTextDisplayText(segments: UiTextSegment[]) {
  return segments.map((segment) => segment.text).join("");
}

export function createUiTextDisplay(node: OutlineNode): UiTextDisplay {
  const segments = createUiTextSegments(node);

  return {
    displayText: getUiTextDisplayText(segments),
    segments,
    style: createToneStyle("default", node.textColor),
    textColorClassName: getSyntaxTextColorClassName(node.textColor),
  };
}

export function getUiBlockLineLabel(block: Pick<CtnBlock, "endLineNumber" | "lineNumber">) {
  return block.lineNumber === block.endLineNumber
    ? `L${block.lineNumber}`
    : `L${block.lineNumber}-${block.endLineNumber}`;
}

export function createUiBlockNode(block: CtnBlock): UiBlockNode {
  return {
    children: block.children.map(createUiBlockNode),
    hasDiagnostics: block.diagnostics.length > 0,
    id: block.id,
    label: block.label,
    level: block.level,
    lineLabel: getUiBlockLineLabel(block),
    lineNumber: block.lineNumber,
    textDisplay: createUiTextDisplay(block),
  };
}

export function createUiOutlineNodes(nodes: OutlineNode[]): UiOutlineNode[] {
  return nodes.map(createUiBlockNode);
}

export function createUiBlockNodes(nodes: CtnBlock[]): UiBlockNode[] {
  return nodes.map(createUiBlockNode);
}

export function flattenUiBlockSubtree(block: UiBlockNode): UiBlockNode[] {
  return [block, ...block.children.flatMap(flattenUiBlockSubtree)];
}

function orderNoteTreeNodesFoldersFirst(nodes: NoteTreeNode[]) {
  return [...nodes].sort((left, right) => {
    if (left.kind === right.kind) {
      return 0;
    }

    return left.kind === "folder" ? -1 : 1;
  });
}

function collectWorkspaceTreeNoteIds(
  nodes: NoteTreeNode[],
  noteIds = new Set<string>(),
  visitedNodeIds = new Set<string>(),
) {
  nodes.forEach((node) => {
    if (visitedNodeIds.has(node.id)) {
      return;
    }

    visitedNodeIds.add(node.id);

    if (node.kind === "note") {
      noteIds.add(node.noteId);
      return;
    }

    collectWorkspaceTreeNoteIds(node.children, noteIds, visitedNodeIds);
  });

  return noteIds;
}

function createNoteMap(notes: Pick<NoteRecord, "id" | "title">[]) {
  return new Map(notes.map((note) => [note.id, note]));
}

function createUiNoteTreeNodes({
  folderId,
  noteMap,
  nodes,
  visitedNodeIds = new Set<string>(),
}: {
  folderId: string | null;
  noteMap: Map<string, Pick<NoteRecord, "id" | "title">>;
  nodes: NoteTreeNode[];
  visitedNodeIds?: Set<string>;
}): UiTreeNode[] {
  return orderNoteTreeNodesFoldersFirst(nodes).flatMap<UiTreeNode>((node) => {
    if (visitedNodeIds.has(node.id)) {
      return [];
    }

    visitedNodeIds.add(node.id);

    if (node.kind === "note") {
      const note = noteMap.get(node.noteId);

      return note
        ? [
            {
              folderId,
              id: node.id,
              kind: "note" as const,
              noteId: note.id,
              title: note.title,
            },
          ]
        : [];
    }

    const children = createUiNoteTreeNodes({
      folderId: node.id,
      noteMap,
      nodes: node.children,
      visitedNodeIds,
    });

    return [
      {
        childCount: node.children.length,
        children,
        folderId: node.id,
        id: node.id,
        kind: "folder" as const,
        title: node.id === defaultFolderId ? "仓库根目录" : node.title,
      },
    ];
  });
}

export function createUiNoteTree({
  includeOrphans = false,
  notes,
  tree,
}: {
  includeOrphans?: boolean;
  notes: Pick<NoteRecord, "id" | "title">[];
  tree: NoteTreeNode[];
}): UiTreeNode[] {
  const noteMap = createNoteMap(notes);
  const treeNoteIds = collectWorkspaceTreeNoteIds(tree);
  const nodes = includeOrphans
    ? [
        ...tree,
        ...notes
          .filter((note) => !treeNoteIds.has(note.id))
          .map(
            (note): NoteTreeNode => ({
              id: `workspace-orphan-${note.id}`,
              kind: "note",
              noteId: note.id,
            }),
          ),
      ]
    : tree;

  return createUiNoteTreeNodes({
    folderId: null,
    noteMap,
    nodes,
  });
}

export function createUiNoteSummaries(
  notes: Pick<NoteRecord, "id" | "title">[],
): UiNoteSummary[] {
  return notes.map((note) => ({
    id: note.id,
    title: note.title,
  }));
}

export function getUiTargetPositionLabel(value: string) {
  if (value === "end") {
    return "文末根块";
  }

  const [kind, lineNumberValue] = value.split(":");
  const lineNumber = Number(lineNumberValue);

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    throw new Error(`Invalid block migration target position: ${value}`);
  }

  switch (kind) {
    case "sibling-above":
      return "上方并列";
    case "sibling-below":
      return "下方并列";
    case "inside":
      return "作为子结点";
    default:
      throw new Error(`Invalid block migration target position: ${value}`);
  }
}

export function parseUiBlockMigrationTargetPosition(
  value: string,
): WorkspaceBlockMigrationTargetPositionRequest {
  if (value === "end") {
    return { kind: "end" };
  }

  const [kind, lineNumberValue] = value.split(":");
  const lineNumber = Number(lineNumberValue);

  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    throw new Error(`Invalid block migration target position: ${value}`);
  }

  if (kind === "sibling-above" || kind === "sibling-below") {
    return {
      kind,
      lineNumber,
    };
  }

  if (kind !== "inside") {
    throw new Error(`Invalid block migration target position: ${value}`);
  }

  return {
    kind: "inside-block",
    lineNumber,
  };
}

export function createUiBlockMigrationTargetPositionValue(
  targetPosition: WorkspaceBlockMigrationTargetPositionRequest,
) {
  switch (targetPosition.kind) {
    case "end":
      return "end";
    case "inside-block":
      return `inside:${targetPosition.lineNumber}`;
    case "sibling-above":
      return `sibling-above:${targetPosition.lineNumber}`;
    case "sibling-below":
      return `sibling-below:${targetPosition.lineNumber}`;
  }
}

function createUiSyntaxProfileDraft(
  draft: SyntaxProfileDraft,
): UiSyntaxProfileDraft {
  return {
    conceptRule: { ...draft.conceptRule },
    inlineRules: draft.inlineRules.map((rule) => ({ ...rule })),
    markerRules: draft.markerRules.map((rule) => ({ ...rule })),
    name: draft.name,
    tabDisplayWidth: draft.tabDisplayWidth,
  };
}

function createUiSyntaxProfileInlineRuleSummary(
  rule: CtnSyntaxProfile["inlineRules"][number],
): UiSyntaxProfileInlineRuleSummary {
  return {
    close: rule.kind === "paired" ? rule.close : "",
    kind: rule.kind,
    label: rule.label,
    marker: rule.kind === "single" ? rule.marker : "",
    open: rule.kind === "paired" ? rule.open : "",
    textColor: rule.textColor,
    tone: rule.tone,
    type: rule.type,
  };
}

function createUiSyntaxProfileSummary(
  profile: CtnSyntaxProfile | null,
): UiSyntaxProfileSummary | null {
  return profile
    ? {
        conceptRule: { ...profile.conceptRule },
        inlineRules: profile.inlineRules.map(createUiSyntaxProfileInlineRuleSummary),
        markerRules: profile.markerRules.map((rule) => ({ ...rule })),
        name: profile.name,
        tabDisplayWidth: profile.tabDisplayWidth,
      }
    : null;
}

function createUiSyntaxProfileDraftBuildResult(
  draftResult: SyntaxProfileDraftBuildResult,
): UiSyntaxProfileDraftBuildResult {
  return {
    diagnostics: draftResult.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    profile: createUiSyntaxProfileSummary(draftResult.profile),
  };
}

export function createUiSyntaxView({
  draft,
  draftResult,
  feedback,
}: {
  draft: SyntaxProfileDraft;
  draftResult: SyntaxProfileDraftBuildResult;
  feedback: UiSyntaxView["feedback"];
}): UiSyntaxView {
  return {
    draft: createUiSyntaxProfileDraft(draft),
    draftResult: createUiSyntaxProfileDraftBuildResult(draftResult),
    feedback,
    roleOptions: syntaxRoleOptions,
    stats: {
      inlineRuleCount: draft.inlineRules.length,
      markerRuleCount: draft.markerRules.length + 1,
    },
    toneOptions: syntaxToneOptions,
  };
}

export function createUiEditorView({
  activeNoteTitle,
  document,
  documentText,
  focusTarget,
  hasActiveNote,
  syntaxProfile,
  errorMessage,
}: {
  activeNoteTitle: string | null;
  document: CtnDocument | null;
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  hasActiveNote: boolean;
  syntaxProfile: CtnSyntaxProfile;
  errorMessage: string;
}): UiEditorView {
  return {
    currentNoteTitle: activeNoteTitle,
    diagnostics:
      document?.diagnostics.map((diagnostic) => ({
        id: diagnostic.id,
        lineNumber: diagnostic.lineNumber,
        message: diagnostic.message,
      })) ?? [],
    documentText,
    focusTarget,
    hasActiveNote,
    hasParsedDocument: document !== null,
    stats: {
      diagnosticCount: document?.diagnostics.length ?? 0,
      lineCount: documentText.split("\n").length,
      rootCount: document?.roots.length ?? 0,
      totalBlocks: document?.blocks.length ?? 0,
    },
    syntaxProfile,
    errorMessage,
  };
}

export function createUiReferenceGraphView(
  graph: NoteReferenceGraph,
): UiReferenceGraphView {
  const nodes = graph.nodes.map((node) => ({
    id: node.id,
    isolated: node.isolated,
    referencesIn: node.referencesIn,
    referencesOut: node.referencesOut,
    title: node.title,
  }));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const mostReferencedNodes = nodes
    .map((node) => ({
      ...node,
      totalReferences: node.referencesIn + node.referencesOut,
    }))
    .filter((node) => node.totalReferences > 0)
    .sort((left, right) => right.totalReferences - left.totalReferences)
    .slice(0, 8);

  return {
    edges: graph.edges.map((edge) => ({
      count: edge.count,
      id: edge.id,
      sourceNoteId: edge.sourceNoteId,
      targetNoteId: edge.targetNoteId,
      targetTitle: edge.targetTitle,
    })),
    mostReferencedNodes,
    nodes,
    stats: {
      edgeCount: graph.edges.length,
      isolatedCount: nodes.filter((node) => node.isolated).length,
      nodeCount: nodes.length,
    },
    unresolvedReferences: graph.unresolvedReferences.map((reference) => ({
      count: reference.count,
      sourceNoteId: reference.sourceNoteId,
      sourceTitle:
        nodesById.get(reference.sourceNoteId)?.title ?? reference.sourceNoteId,
      targetText: reference.targetText,
    })),
  };
}

export function createUiSidebarView({
  activeFolderId,
  activeNoteFolderId,
  activeNoteId,
  folderCount,
  noteTree,
  repositoryPath,
  saveStatusLabel,
  storageLabel,
}: Omit<UiSidebarView, "defaultFolderId">): UiSidebarView {
  return {
    activeFolderId,
    activeNoteFolderId,
    activeNoteId,
    defaultFolderId,
    folderCount,
    noteTree,
    repositoryPath,
    saveStatusLabel,
    storageLabel,
  };
}
