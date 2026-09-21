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
export {
  initialProblemsFilters,
  type ProblemsFilters,
} from "./problems/ProblemsPanel.tsx";
export { useWorkbenchProblemsShortcut } from "./problems/useProblemsShortcut.ts";
export { cx } from "./shared/classNames.ts";

export { ConfirmAction } from "./shared/ConfirmAction.tsx";

export {
  FeedbackProvider,
  runActivityFeedbackAction,
  useFeedback,
  useWorkbenchFeedback,
} from "./shared/FeedbackProvider.tsx";
export type { WorkbenchActivityFeedbackController } from "./shared/FeedbackProvider.tsx";
export { FormError, FormSaveActions } from "./shared/FormStatus.tsx";
export { AssociatedForm } from "./shared/AssociatedForm.tsx";
export {
  getListReorderIndex,
  getListRowDropPlacement,
} from "./shared/listDrag.ts";
export type { ListRowDropPlacement } from "./shared/listDrag.ts";
export { Page, PageBody } from "./shared/Page.tsx";
export { TriggerPopover } from "./shared/TriggerPopover.tsx";

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

export { createWorkbenchStatus } from "./workbench/workbenchStatus.tsx";

export { createClassNames } from "./shared/contentClasses.ts";

export { uiConfig } from "./foundation/config.ts";
