import type { CtnSyntaxProfile } from "../../ctn/syntax/types";

export type UiFolderId = string;
export type UiNoteId = string;
export type UiNodeId = string;
export type UiSyntaxTone = string;

export type UiEditorFocusTarget = {
  lineNumber: number;
  requestId: number;
};

export type UiToneStyle = {
  "--ctn-text-color"?: string;
  "--ctn-tone-color"?: string;
};

export type UiTextSegment =
  | {
      id: string;
      kind: "text";
      text: string;
    }
  | {
      id: string;
      kind: "inline";
      text: string;
      textColorClassName: string;
      toneClassName: string;
      style?: UiToneStyle;
    };

export type UiTextDisplay = {
  displayText: string;
  segments: UiTextSegment[];
  style?: UiToneStyle;
  textColorClassName: string;
};

export type UiBlockNode = {
  children: UiBlockNode[];
  hasDiagnostics: boolean;
  id: UiNodeId;
  label: string;
  level: number;
  lineLabel: string;
  lineNumber: number;
  textDisplay: UiTextDisplay;
};

export type UiOutlineNode = UiBlockNode;

export type UiTreeNode =
  | {
      childCount: number;
      children: UiTreeNode[];
      folderId: UiFolderId;
      id: UiNodeId;
      kind: "folder";
      title: string;
    }
  | {
      folderId: UiFolderId | null;
      id: UiNodeId;
      kind: "note";
      noteId: UiNoteId;
      title: string;
    };

export type UiNoteSummary = {
  id: UiNoteId;
  title: string;
};

export type UiEditorDiagnostic = {
  id: string;
  lineNumber: number;
  message: string;
};

export type UiEditorView = {
  currentNoteTitle: string | null;
  diagnostics: UiEditorDiagnostic[];
  documentText: string;
  focusTarget: UiEditorFocusTarget | null;
  hasActiveNote: boolean;
  hasParsedDocument: boolean;
  stats: {
    diagnosticCount: number;
    lineCount: number;
    rootCount: number;
    totalBlocks: number;
  };
  syntaxProfile: CtnSyntaxProfile;
  errorMessage: string;
};

export type UiSyntaxRole = "normal" | "multiline";

export type UiSyntaxToneOption = {
  label: string;
  value: UiSyntaxTone;
};

export type UiSyntaxRoleOption = {
  label: string;
  value: UiSyntaxRole;
};

export type UiSyntaxProfileDraftMarkerRule = {
  id: string;
  label: string;
  marker: string;
  role: UiSyntaxRole;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  type: string;
};

export type UiSyntaxProfileDraftConceptRule = {
  id: string;
  label: string;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  type: string;
};

export type UiSyntaxProfileDraftInlineRule = {
  close: string;
  id: string;
  kind: "paired" | "single";
  label: string;
  marker: string;
  open: string;
  textColor: UiSyntaxTone;
  tone: UiSyntaxTone;
  type: string;
};

export type UiSyntaxProfileDraft = {
  conceptRule: UiSyntaxProfileDraftConceptRule;
  inlineRules: UiSyntaxProfileDraftInlineRule[];
  markerRules: UiSyntaxProfileDraftMarkerRule[];
  name: string;
  tabDisplayWidth: string;
};

export type UiSyntaxProfileMarkerRuleSummary = Omit<
  UiSyntaxProfileDraftMarkerRule,
  "id"
>;

export type UiSyntaxProfileConceptRuleSummary = Omit<
  UiSyntaxProfileDraftConceptRule,
  "id"
>;

export type UiSyntaxProfileInlineRuleSummary = Omit<
  UiSyntaxProfileDraftInlineRule,
  "id"
>;

export type UiSyntaxProfileSummary = {
  conceptRule: UiSyntaxProfileConceptRuleSummary;
  inlineRules: UiSyntaxProfileInlineRuleSummary[];
  markerRules: UiSyntaxProfileMarkerRuleSummary[];
  name: string;
  tabDisplayWidth: number;
};

export type UiSyntaxProfileDiagnostic = {
  message: string;
  path: string;
};

export type UiSyntaxProfileDraftBuildResult = {
  diagnostics: UiSyntaxProfileDiagnostic[];
  profile: UiSyntaxProfileSummary | null;
};

export type UiSyntaxView = {
  draft: UiSyntaxProfileDraft;
  draftResult: UiSyntaxProfileDraftBuildResult;
  feedback: {
    message: string;
    status: "error" | "success";
  } | null;
  roleOptions: UiSyntaxRoleOption[];
  stats: {
    inlineRuleCount: number;
    markerRuleCount: number;
  };
  toneOptions: UiSyntaxToneOption[];
};

export type UiMigrationView = {
  noteTree: UiTreeNode[];
  notes: UiNoteSummary[];
  sourceBlocks: UiBlockNode[];
  sourceNote: UiNoteSummary | null;
  sourceNoteId: UiNoteId;
  sourceRoots: UiBlockNode[];
  targetNote: UiNoteSummary | null;
  targetNoteId: UiNoteId;
  targetRoots: UiBlockNode[];
};

export type UiReferenceGraphNode = {
  id: UiNoteId;
  isolated: boolean;
  referencesIn: number;
  referencesOut: number;
  title: string;
};

export type UiReferenceGraphEdge = {
  count: number;
  id: string;
  sourceNoteId: UiNoteId;
  targetNoteId: UiNoteId;
  targetTitle: string;
};

export type UiReferenceGraphUnresolvedReference = {
  count: number;
  sourceNoteId: UiNoteId;
  sourceTitle: string;
  targetText: string;
};

export type UiReferenceGraphRankedNode = UiReferenceGraphNode & {
  totalReferences: number;
};

export type UiReferenceGraphView = {
  edges: UiReferenceGraphEdge[];
  mostReferencedNodes: UiReferenceGraphRankedNode[];
  nodes: UiReferenceGraphNode[];
  stats: {
    edgeCount: number;
    isolatedCount: number;
    nodeCount: number;
  };
  unresolvedReferences: UiReferenceGraphUnresolvedReference[];
};

export type UiSidebarView = {
  activeFolderId: UiFolderId;
  activeNoteFolderId: UiFolderId | null;
  activeNoteId: UiNoteId | null;
  defaultFolderId: UiFolderId;
  folderCount: number;
  noteTree: UiTreeNode[];
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
};
