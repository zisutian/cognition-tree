import { useEffect, useMemo, useState } from "react";
import type { WorkspaceParseIndex } from "../../../../../core/workspace/indexes/workspaceParseIndex";
import { createUiWorkbenchDiagnostics } from "../../../../../application/workspace/projection/viewDiagnostics";
import {
  createEmptyNoteReferenceGraph,
  type WorkspaceAnalysis,
} from "../../../../../application/workspace/analysis/workspaceAnalysis";
import { startWorkspaceAnalysisCollection } from "../../../../../application/workspace/analysis/workspaceAnalysisCollection";
import { clientApplicationScheduler } from "../../../../../infrastructure/client/clientApplicationServices";

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
  enabled,
  index,
}: {
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
      scheduler: clientApplicationScheduler,
    });
  }, [activeIndex, initialAnalysis, token]);

  return state.token === token ? state.analysis : initialAnalysis;
}
