// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceParseIndex } from "../../../core/workspace/index.ts";
import {
  createUiWorkbenchDiagnostics,
  createEmptyNoteReferenceGraph,
  type WorkspaceAnalysis,
  startWorkspaceAnalysisCollection,
} from "../../../application/workspace/index.ts";


import type { ApplicationScheduler } from "../../../application/runtime/index.ts";

function createIdleWorkspaceAnalysis(): WorkspaceAnalysis {
  return {
    diagnostics: createUiWorkbenchDiagnostics([], "ready"),
    index: null,
    parsedNotesById: new Map(),
    referenceGraph: createEmptyNoteReferenceGraph(),
    status: "ready",
    titleIndex: new Map(),
  };
}

function createCollectingWorkspaceAnalysis(
  index: NonNullable<WorkspaceAnalysis["index"]>,
): WorkspaceAnalysis {
  return {
    diagnostics: createUiWorkbenchDiagnostics([], "collecting"),
    index,
    parsedNotesById: new Map(),
    referenceGraph: createEmptyNoteReferenceGraph(),
    status: "collecting",
    titleIndex: index.titleIndex,
  };
}

type WorkspaceAnalysisState = {
  analysis: WorkspaceAnalysis;
  token: object;
};

export function useWorkspaceAnalysis({
  scheduler,
  enabled,
  index,
}: {
  scheduler: ApplicationScheduler;
  enabled: boolean;
  index: WorkspaceParseIndex | null;
}): WorkspaceAnalysis {
  const activeIndex = enabled ? index : null;
  const token = useMemo(() => ({}), [activeIndex]);
  const initialAnalysis = useMemo(
    () => activeIndex
      ? createCollectingWorkspaceAnalysis(activeIndex)
      : createIdleWorkspaceAnalysis(),
    [activeIndex],
  );
  const [state, setState] = useState<WorkspaceAnalysisState>({
    analysis: initialAnalysis,
    token,
  });

  useEffect(() => {
    setState({ analysis: initialAnalysis, token });

    if (!activeIndex) {
      return;
    }

    return startWorkspaceAnalysisCollection({
      index: activeIndex,
      onUpdate(analysis) {
        setState((current) =>
          current.token === token ? { analysis, token } : current,
        );
      },
      scheduler,
    });
  }, [activeIndex, initialAnalysis, token, scheduler]);

  return state.token === token ? state.analysis : initialAnalysis;
}
