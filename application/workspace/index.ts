// SPDX-License-Identifier: GPL-3.0-or-later



export type {
  ActiveWorkspaceSession,
} from "./session/workspaceSessionApplication.ts";
export {
  createEmptyNoteReferenceGraph,
} from "./analysis/workspaceAnalysis.ts";
export {
  createInitialRepositoryContent,
} from "./session/initialRepository.ts";
export {
  createLocalDraftRevision,
  WorkspaceRepositoryBackendConflictError,
  WorkspaceRepositoryLocalConflictError,
  WorkspaceRepositoryRemoteError,
  WorkspaceRepositoryUnavailableError,
} from "./persistence/workspaceRepository.ts";
export {
  createStructureOperationProjection,
} from "./notes/structure/structureOperationProjection.ts";
export {
  createUiEditorView,
} from "./projection/viewEditor.ts";
export {
  createUiNoteTree,
} from "./projection/viewTree.ts";
export {
  createUiOutlineNodes,
  findUiOutlineNodeAtLine,
  flattenUiBlockSubtree,
} from "./projection/viewBlocks.ts";
export {
  createUiReferenceGraphView,
} from "./projection/viewGraph.ts";
export {
  createUiWorkbenchDiagnostics,
  createUiWorkspacePortableNameDiagnostics,
} from "./projection/viewDiagnostics.ts";
export {
  createWorkspaceSessionController,
} from "./session/workspaceSessionController.ts";
export {
  createWorkspaceTreeMoveDestination,
  createWorkspaceTreeNodeReference,
} from "./selection/sidebarTreeMove.ts";
export {
  executeStructureBlockMoveBetweenNotes,
  executeStructureBlockMoveWithinNote,
} from "./notes/structure/structureOperationWorkflow.ts";
export type {
  LocalDraftRevision,
  RepositoryRevision,
  WorkspaceRepository,
  WorkspaceRepositoryBackend,
  WorkspaceRepositoryContent,
  WorkspaceRepositoryPreparationPolicy,
} from "./persistence/workspaceRepository.ts";
export {
  mergeWorkspaceContent,
} from "./persistence/workspaceThreeWayMerge.ts";
export type {
  NotesViewModel,
} from "./notes/edit/notesViewModel.ts";
export {
  prepareAgentWorkspaceCommand,
} from "./commands/workspaceAgentCommandPreparation.ts";
export {
  prepareWorkspaceRepositoryContent,
  prepareWorkspaceSyntaxCatalog,
} from "./persistence/workspaceRepositoryPreparation.ts";
export {
  projectWorkspaceAgentProposalReview,
  projectWorkspaceContentChanges,
} from "./commands/workspaceContentProjection.ts";
export {
  projectWorkspaceSessionApplication,
} from "./session/workspaceSessionApplication.ts";
export type {
  ReferenceGraphLocalDepth,
  ReferenceGraphMode,
  VisualizationFilterController,
  VisualizationViewModel,
} from "./notes/graph/visualizationViewModel.ts";
export {
  resolveActiveNoteId,
  resolveActiveNoteIdAfterRemovingNote,
  resolveActiveNoteIdAfterRemovingNotes,
  resolveDifferentNoteId,
} from "./selection/viewSelection.ts";
export {
  resolveFolderSelection,
} from "./selection/resolveFolderSelection.ts";
export {
  resolveStructureOperationDirectorySelection,
  resolveSwappedStructureOperationPair,
} from "./notes/structure/directorySelection.ts";
export type {
  SessionCommandDependencies,
  SessionCommands,
} from "./session/sessionCommands.ts";
export {
  startWorkspaceAnalysisCollection,
} from "./analysis/workspaceAnalysisCollection.ts";
export type {
  StructureOperationActivityViewModel,
} from "./notes/structure/structureOperationViewModel.ts";
export type {
  StructureOperationPairSelectionPhase,
} from "./notes/structure/directorySelection.ts";
export type {
  UiBlockNode,
} from "./projection/viewBlocks.ts";
export type {
  UiDirectoryActiveNode,
  UiFolderId,
  UiNoteId,
  UiTreeMoveRequest,
} from "./projection/viewTree.ts";
export type {
  UiEditorFocusTarget,
} from "./projection/viewEditor.ts";
export type {
  UiReferenceGraphEdge,
  UiReferenceGraphNode,
  UiReferenceGraphView,
} from "./projection/viewGraph.ts";
export type {
  UiStructureOperationView,
} from "./projection/viewStructureOperation.ts";
export type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "./projection/viewDiagnostics.ts";
export type {
  WorkspaceAgentCommandIntent,
  WorkspaceResourceVersionPolicy,
} from "./commands/workspaceAgentCommandPreparation.ts";
export type {
  WorkspaceAnalysis,
} from "./analysis/workspaceAnalysis.ts";
export type {
  WorkspaceDirectoryMutations,
  WorkspaceSelection,
} from "./selection/workspaceSelection.ts";
export type {
  WorkspaceRepositoryPreparation,
  WorkspaceRepositoryPreparationObserver,
  WorkspaceSyntaxCatalogPreparation,
} from "./persistence/workspaceRepositoryPreparation.ts";
export type {
  WorkspaceRepositoryProvider,
  WorkspaceRepositoryProvisioner,
} from "./persistence/workspaceRepositoryProvider.ts";
export {
  WorkspaceRevisionConflictError,
} from "./persistence/workspaceCommitErrors.ts";
export type {
  WorkspaceSessionController,
  WorkspaceSessionControllerState,
} from "./session/workspaceSessionController.ts";

export { workspaceRepositoryPreparation } from "./persistence/workspaceRepositoryPreparation.ts";

export { createLocalFirstWorkspaceRepository } from "./persistence/localFirstWorkspaceRepository.ts";

export { createLocalFirstWorkspaceCatalog } from "./persistence/localFirstWorkspaceCatalog.ts";
