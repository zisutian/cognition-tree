// SPDX-License-Identifier: GPL-3.0-or-later

export {
  appendNoteToWorkspaceTree,
} from "./model/noteTree/mutations.ts";
export {
  attachWorkspaceSyntax,
} from "./context/workspaceContext.ts";
export {
  collectWorkspaceNoteIdsInFolder,
  findWorkspaceNote,
  getParsedWorkspaceNote,
  getWorkspaceTree,
  hasWorkspaceNote,
  listWorkspaceNotes,
} from "./queries/workspaceQueries.ts";
export {
  collectWorkspacePortableNameIssues,
} from "./queries/workspacePortableNameIssues.ts";
export {
  collectWorkspaceTitleBlockIds,
  validateWorkspaceTitleBlockMetadata,
  WorkspaceBlockMetadataError,
} from "./context/workspaceBlockMetadata.ts";
export {
  createCanonicalNoteSource,
  createInitialWorkspaceData,
  createNoteRecord,
  defaultNoteTitle,
  readWorkspaceNoteHeader,
  WorkspaceNoteHeaderError,
} from "./model/workspaceData.ts";
export {
  createInitialWorkspaceSyntax,
  createInitialWorkspaceSyntaxSource,
  parseWorkspaceSyntax,
} from "./context/workspaceSyntax.ts";
export {
  createWorkspaceFolder,
  createWorkspaceNote,
  deleteWorkspaceFolder,
  deleteWorkspaceNote,
  findAvailableDefaultNoteTitle,
  moveWorkspaceTreeNode,
  moveWorkspaceTreeNodes,
  renameWorkspaceFolder,
  renameWorkspaceNote,
  updateWorkspaceNoteSource,
  updateWorkspaceRawNoteSource,
} from "./commands/workspaceCommands.ts";
export {
  createWorkspaceParseIndex,
} from "./indexes/workspaceParseIndex.ts";
export {
  createWorkspaceStructureIndex,
} from "./indexes/workspaceStructureIndex.ts";
export type {
  FolderId,
  NoteId,
  NoteRecord,
  NoteTreeNode,
  WorkspaceData,
  WorkspaceNote,
} from "./model/workspaceData.ts";
export {
  isWorkspaceSyntaxFileId,
  normalizeWorkspaceSyntaxName,
} from "./model/workspaceSyntaxCatalog.ts";
export {
  moveWorkspaceStructureBlockBetweenNotes,
  moveWorkspaceStructureBlockWithinNote,
  moveWorkspaceStructureBlocks,
} from "./commands/structureBlockCommands.ts";
export type {
  MoveWorkspaceStructureBlockBetweenNotesFailureReason,
  MoveWorkspaceStructureBlockWithinNoteFailureReason,
  WorkspaceStructureBlockMoveBetweenNotesRequest,
  WorkspaceStructureBlockMoveWithinNoteRequest,
  WorkspaceStructureBlockTargetPositionRequest,
  WorkspaceStructureBlockTarget,
  WorkspaceStructureBlocksMoveRequest,
  WorkspaceStructureBlocksMoveFailureReason,
  WorkspaceStructureBlocksMoveResult,
} from "./commands/structureBlockCommands.ts";
export type {
  NoteReferenceGraph,
  ParsedWorkspaceNote,
  WorkspaceParseIndex,
} from "./indexes/workspaceParseIndex.ts";
export type {
  NoteTreeMoveRequest,
  NoteTreeBatchMoveRequest,
  NoteTreeMoveDestination,
  NoteTreeNodeReference,
} from "./model/noteTree/types.ts";
export {
  reconcileWorkspaceSyntaxBlockMetadata,
} from "./context/workspaceSyntaxMetadata.ts";
export {
  resolveWorkspaceReferenceNavigation,
} from "./queries/workspaceReferenceNavigation.ts";
export type {
  WorkspaceCommandOutcome,
} from "./commands/workspaceCommandOutcome.ts";
export type {
  WorkspaceContext,
} from "./context/workspaceContext.ts";
export type {
  WorkspaceReferenceNavigationDestination,
} from "./queries/workspaceReferenceNavigation.ts";
export type {
  WorkspaceStructureIndex,
} from "./indexes/workspaceStructureIndex.ts";
export type {
  WorkspaceSyntax,
} from "./context/workspaceSyntax.ts";
export type {
  WorkspaceSyntaxCatalog,
} from "./model/workspaceSyntaxCatalog.ts";

export { listWorkspaceResourcePaths } from "./queries/workspacePaths.ts";
export type { WorkspaceResourcePath } from "./queries/workspacePaths.ts";
