// SPDX-License-Identifier: GPL-3.0-or-later

export type {
  ActivityControllerProps,
  RenderActivity,
} from "./activityController.ts";
export type {
  ActivityId,
  ActivityNavigationItem,
  ActivitySlots,
} from "./activityTypes.ts";
export {
  Button,
  cx,
  DetailPanel,
  EmptyState,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
  SymbolSlot,
  ToggleButton,
} from "./shared/primitives.tsx";
export {
  ChoiceGroup,
  ColorControl,
  InputControl,
  RangeControl,
  SelectControl,
  TextareaControl,
} from "./shared/controls.tsx";
export {
  CompactContextActionButtons,
  CompactContextGroup,
  CompactContextList,
  CompactContextRow,
  CompactContextStatusIcon,
} from "./shared/CompactContextList.tsx";
export {
  ContextMenu,
} from "./shared/ContextMenu.tsx";
export type {
  ContextMenuPosition,
} from "./shared/ContextMenu.tsx";
export {
  createRepositorySessionKey,
  globalWorkbenchSessionId,
} from "./workbench/repositorySessionStore.ts";
export {
  createToneStyle,
  getTextColorClassName,
  getTextColorStyleDeclaration,
  getToneClassName,
  getToneStyleDeclaration,
  isCustomTone,
} from "./shared/tonePresentation.ts";
export {
  default,
} from "./AppView.tsx";
export {
  FeedbackProvider,
  runActivityFeedbackAction,
  useFeedback,
  useWorkbenchFeedback,
} from "./shared/FeedbackProvider.tsx";
export {
  FieldRow,
  FormActions,
  FormLayout,
} from "./shared/FormLayout.tsx";
export {
  getListReorderIndex,
  getListRowDropPlacement,
} from "./shared/listDrag.ts";
export {
  getStructureTreeRowStyle,
  NoteTree,
  StructureTree,
  TreeMoveQuickPick,
} from "./shared/tree/index.ts";
export type {
  ListRowDropPlacement,
} from "./shared/listDrag.ts";
export {
  ManagementList,
  ManagementRow,
} from "./shared/ManagementList.tsx";
export {
  Popover,
} from "./shared/Popover.tsx";
export {
  ProblemsPanel,
} from "./problems/ProblemsPanel.tsx";
export {
  QuickPick,
} from "./shared/QuickPick.tsx";
export {
  RepositoryCreateForm,
} from "./RepositoryCreateForm.tsx";
export {
  RepositorySessionStateProvider,
  useRepositorySessionState,
} from "./workbench/useRepositorySessionState.ts";
export {
  StatusBadge,
} from "./shared/StatusPresentation.tsx";
export type {
  StructureTreeProps,
  StructureTreeRowProps,
  TreeNode,
} from "./shared/tree/index.ts";
export {
  SubsectionTabs,
} from "./shared/SubsectionTabs.tsx";
export {
  SyntaxUnavailablePanel,
} from "./SyntaxUnavailablePanel.tsx";
export {
  ToolDetailPanel,
  ToolDivider,
  ToolList,
  ToolListRow,
  ToolPanel,
  ToolPanelBody,
  ToolPropertyList,
  ToolPropertyRow,
  ToolSection,
  ToolSectionStack,
  ToolToolbar,
} from "./shared/ToolSurface.tsx";
export {
  useExclusiveAsyncAction,
} from "./shared/useExclusiveAsyncAction.ts";
export {
  useReferenceNavigation,
} from "./shared/useReferenceNavigation.tsx";
export {
  useWorkbenchLayout,
} from "./workbench/useWorkbenchLayout.ts";
export {
  useWorkbenchProblemsShortcut,
} from "./problems/useProblemsShortcut.ts";
export type {
  WorkbenchActivityFeedbackController,
} from "./shared/FeedbackProvider.tsx";
export type {
  WorkbenchController,
} from "./workbench/useWorkbenchLayout.ts";
