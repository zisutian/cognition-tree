import { useState } from "react";
import {
  appContextDefaultWidth,
  appDetailDefaultWidth,
  appProblemsDefaultHeight,
  clampAppContextWidth,
  clampAppProblemsHeight,
} from "./frameResize.ts";
import {
  useWorkbenchPanelResize,
  type WorkbenchPanelResizeController,
} from "./useWorkbenchPanelResize.ts";
import { useRepositorySessionState } from "./useRepositorySessionState.ts";
import {
  createRepositorySessionKey,
} from "./repositorySessionStore.ts";

type RepositoryProblemsLayout = {
  expanded: boolean;
  height: number;
};

const contextWidthSessionKey = createRepositorySessionKey<number | null>(
  "workbench-context-width",
);
const problemsLayoutSessionKey =
  createRepositorySessionKey<RepositoryProblemsLayout>(
    "workbench-problems-layout",
  );

function createRepositoryProblemsLayout(): RepositoryProblemsLayout {
  return { expanded: false, height: appProblemsDefaultHeight };
}

export type WorkbenchLayout = WorkbenchPanelResizeController & {
  contextCollapsed: boolean;
  contextResizeValue: number;
  contextWidth: number | null;
  detailCollapsed: boolean;
  detailResizeValue: number;
  detailWidth: number | null;
  focusMode: boolean;
  onDetailToggle: () => void;
  problemsExpanded: boolean;
  problemsHeight: number;
  problemsResizeValue: number;
};

export function useWorkbenchLayout(repositoryId: string) {
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [contextWidth, setContextWidth] = useRepositorySessionState<number | null>(
    contextWidthSessionKey,
    repositoryId,
    () => null,
  );
  const [detailWidth, setDetailWidth] = useState<number | null>(null);
  const [problemsLayout, setProblemsLayout] = useRepositorySessionState(
    problemsLayoutSessionKey,
    repositoryId,
    createRepositoryProblemsLayout,
  );
  const [focusMode, setFocusMode] = useState(false);
  const contextResizeValue = contextWidth ?? appContextDefaultWidth;
  const detailResizeValue = detailWidth ?? appDetailDefaultWidth;
  const problemsResizeValue = problemsLayout.height;

  const panelResize = useWorkbenchPanelResize({
    context: {
      collapsed: contextCollapsed,
      resizeValue: contextResizeValue,
      setWidth: (width) => setContextWidth(clampAppContextWidth(width)),
    },
    detail: {
      collapsed: detailCollapsed,
      resizeValue: detailResizeValue,
      setWidth: setDetailWidth,
    },
    problems: {
      expanded: problemsLayout.expanded,
      resizeValue: problemsResizeValue,
      setHeight: (height) =>
        setProblemsLayout((current) => ({
          ...current,
          height: clampAppProblemsHeight(height),
        })),
    },
  });
  const expandPanels = () => {
    setFocusMode(false);
    setContextCollapsed(false);
    setDetailCollapsed(false);
  };

  const layout: WorkbenchLayout = {
    ...panelResize,
    contextCollapsed,
    contextResizeValue,
    contextWidth,
    detailCollapsed,
    detailResizeValue,
    detailWidth,
    focusMode,
    onDetailToggle: () => setDetailCollapsed((current) => !current),
    problemsExpanded: problemsLayout.expanded,
    problemsHeight: problemsLayout.height,
    problemsResizeValue,
  };

  return {
    collapseDetail: () => setDetailCollapsed(true),
    expandPanels,
    exitFocusMode: () => setFocusMode(false),
    layout,
    setContextWidth: (width: number) =>
      setContextWidth(clampAppContextWidth(width)),
    toggleContext: () => setContextCollapsed((current) => !current),
    toggleFocusMode: () => setFocusMode((current) => !current),
    toggleProblems: () => {
      if (focusMode) {
        setFocusMode(false);
        setProblemsLayout((current) => ({ ...current, expanded: true }));
        return;
      }

      setProblemsLayout((current) => ({
        ...current,
        expanded: !current.expanded,
      }));
    },
  };
}

export type WorkbenchController = ReturnType<typeof useWorkbenchLayout>;
