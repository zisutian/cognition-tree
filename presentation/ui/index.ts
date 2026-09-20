// SPDX-License-Identifier: GPL-3.0-or-later

export type {
  ActivityControllerProps,
  RenderActivity,
} from "./activityController.ts";
export type {
  ActivityId,
  ActivityInteractionState,
  ActivityNavigationItem,
  ActivitySlots,
} from "./activityTypes.ts";
export { default } from "./AppView.tsx";
export { ProblemsPanel } from "./problems/ProblemsPanel.tsx";
export { useWorkbenchProblemsShortcut } from "./problems/useProblemsShortcut.ts";
export { cx } from "./shared/classNames.ts";
export {
  CompactContextActionButtons,
  CompactContextGroup,
  CompactContextGroupHeader,
  CompactContextList,
  CompactContextRow,
  CompactContextStatusIcon,
} from "./shared/CompactContextList.tsx";
export { ConfirmAction } from "./shared/ConfirmAction.tsx";
export { ContextMenu } from "./shared/ContextMenu.tsx";
export type { ContextMenuPosition } from "./shared/ContextMenu.tsx";
export { EmptyState } from "./shared/EmptyState.tsx";
export {
  FeedbackProvider,
  runActivityFeedbackAction,
  useFeedback,
  useWorkbenchFeedback,
} from "./shared/FeedbackProvider.tsx";
export type { WorkbenchActivityFeedbackController } from "./shared/FeedbackProvider.tsx";
export { FormError, FormSaveActions } from "./shared/FormStatus.tsx";
export {
  getListReorderIndex,
  getListRowDropPlacement,
} from "./shared/listDrag.ts";
export type { ListRowDropPlacement } from "./shared/listDrag.ts";
export { Page, PageBody } from "./shared/Page.tsx";
export { Popover } from "./shared/Popover.tsx";
export {
  Button,
  CheckboxControl,
  CheckboxGroup,
  ChoiceGroup,
  ColorControl,
  InputControl,
  RangeControl,
  SelectControl,
  TextareaControl,
  ToggleButton,
} from "./shared/publicControls.ts";
export {
  FieldRow,
  FormActions,
  FormLayout,
  ManagementList,
  ManagementRow,
  Section,
  SectionStack,
  StatusBadge,
  ToolDivider,
  ToolList,
  ToolListRow,
  ToolPropertyList,
  ToolPropertyRow,
  ToolToolbar,
} from "./shared/publicSurfaces.ts";
export { QuickPick } from "./shared/QuickPick.tsx";
export { SymbolSlot } from "./shared/SymbolSlot.tsx";
export {
  createToneStyle,
  getTextColorClassName,
  getTextColorStyleDeclaration,
  getToneClassName,
  getToneStyleDeclaration,
  isCustomTone,
} from "./shared/tonePresentation.ts";
export {
  NoteTree,
  StructureTree,
  TreeMoveQuickPick,
  getStructureTreeRowStyle,
} from "./shared/tree/index.ts";
export type {
  StructureTreeProps,
  StructureTreeRowProps,
  TreeNode,
} from "./shared/tree/index.ts";
export { useExclusiveAsyncAction } from "./shared/useExclusiveAsyncAction.ts";
export { useReferenceNavigation } from "./shared/useReferenceNavigation.tsx";
export {
  createRepositorySessionKey,
  globalWorkbenchSessionId,
} from "./workbench/repositorySessionStore.ts";
export {
  RepositorySessionStateProvider,
  useRepositorySessionState,
} from "./workbench/useRepositorySessionState.ts";
export { useWorkbenchLayout } from "./workbench/useWorkbenchLayout.ts";
export type { WorkbenchController } from "./workbench/useWorkbenchLayout.ts";

export { checkboxControlClassName } from "./shared/controlPresentation.ts";
export { StatusBar } from "./workbench/StatusBar.tsx";

export { FocusAction } from "./RegionFrame.tsx";
export { createClassNames } from "./shared/contentClasses.ts";
export { ListAction } from "./shared/ListAction.tsx";

export { designMetrics } from "./foundation/designTokens.ts";
