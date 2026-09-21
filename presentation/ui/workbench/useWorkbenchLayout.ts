import { useState } from "react";
import {
  initialWorkbenchLayout,
  useDesignConfig,
  type WorkbenchLayoutState,
} from "compact-ui";
import { useRepositorySessionState } from "./useRepositorySessionState.ts";
import { createRepositorySessionKey } from "./repositorySessionStore.ts";

const repositoryLayoutKey =
  createRepositorySessionKey<
    Pick<
      WorkbenchLayoutState,
      "contextWidth" | "bottomHeight" | "bottomExpanded"
    >
  >("workbench-layout");

/** Persist values only. Compact UI owns measuring, fitting and dragging regions. */
export function useWorkbenchLayout(repositoryId: string) {
  const config = useDesignConfig();
  const defaults = initialWorkbenchLayout(config);
  const [global, setGlobal] = useState<
    Omit<
      WorkbenchLayoutState,
      "contextWidth" | "bottomHeight" | "bottomExpanded"
    >
  >(() => ({
    contextCollapsed: defaults.contextCollapsed,
    detailCollapsed: defaults.detailCollapsed,
    detailWidth: defaults.detailWidth,
    focusMode: defaults.focusMode,
  }));
  const [repository, setRepository] = useRepositorySessionState(
    repositoryLayoutKey,
    repositoryId,
    () => ({
      contextWidth: defaults.contextWidth,
      bottomHeight: defaults.bottomHeight,
      bottomExpanded: false,
    }),
  );
  const value = { ...global, ...repository };
  const change = (next: WorkbenchLayoutState) => {
    const { contextWidth, bottomHeight, bottomExpanded, ...shared } = next;
    setGlobal(shared);
    setRepository({
      contextWidth,
      bottomHeight,
      bottomExpanded,
    });
  };
  return {
    layout: value,
    onLayoutChange: change,
    expandPanels: () =>
      change({
        ...value,
        focusMode: false,
        contextCollapsed: false,
        detailCollapsed: false,
      }),
    expandContext: () =>
      change({ ...value, focusMode: false, contextCollapsed: false }),
    exitFocusMode: () => change({ ...value, focusMode: false }),
    setContextWidth: (width: number) =>
      change({
        ...value,
        contextWidth: Math.max(
          config.layout.context.min,
          Math.min(config.layout.context.max, width),
        ),
      }),
    toggleFocusMode: () => change({ ...value, focusMode: !value.focusMode }),
    toggleProblems: () =>
      change({
        ...value,
        focusMode: false,
        bottomExpanded: value.focusMode || !value.bottomExpanded,
      }),
  };
}
export type WorkbenchController = ReturnType<typeof useWorkbenchLayout>;
