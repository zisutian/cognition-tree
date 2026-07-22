import { useEffect, useMemo, useState } from "react";
import type { WorkspaceContext } from "../../../../core/workspace/context/workspaceContext";
import type { WorkspaceParseIndexCache } from "../../../../core/workspace/indexes/workspaceParseIndex";
import { createUiWorkbenchDiagnostics } from "../projection/viewDiagnostics";
import { useWorkspaceParseIndex } from "../runtime/useWorkspaceParseIndex";
import {
  createEmptyNoteReferenceGraph,
  type WorkspaceAnalysis,
} from "./workspaceAnalysis";
import { startWorkspaceAnalysisCollection } from "./workspaceAnalysisCollection";

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
  context,
  enabled,
  indexCache,
}: {
  context: WorkspaceContext | null;
  enabled: boolean;
  indexCache: WorkspaceParseIndexCache;
}): WorkspaceAnalysis {
  const index = useWorkspaceParseIndex(
    indexCache,
    enabled ? context : null,
  );
  const token = useMemo(() => ({}), [index]);
  const initialAnalysis = useMemo(
    () => index
      ? createCollectingWorkspaceAnalysis(index)
      : createIdleWorkspaceAnalysis(),
    [index],
  );
  const [state, setState] = useState<WorkspaceAnalysisState>({
    analysis: initialAnalysis,
    token,
  });

  useEffect(() => {
    setState({ analysis: initialAnalysis, token });

    if (!index) {
      return;
    }

    return startWorkspaceAnalysisCollection({
      index,
      onUpdate(analysis) {
        setState((current) =>
          current.token === token ? { analysis, token } : current,
        );
      },
    });
  }, [index, initialAnalysis, token]);

  return state.token === token ? state.analysis : initialAnalysis;
}
