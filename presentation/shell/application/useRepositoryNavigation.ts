import { useCallback, useRef, useState } from "react";
import type {
  RepositoryFocusRequest,
  RepositoryFocusTarget,
} from "../../../application/repository/repositoryNavigation";

export function useRepositoryNavigation() {
  const nextRequestIdRef = useRef(1);
  const [focusRequest, setFocusRequest] =
    useState<RepositoryFocusRequest | null>(null);
  const focus = useCallback((target: RepositoryFocusTarget) => {
    const requestId = nextRequestIdRef.current;

    nextRequestIdRef.current += 1;
    setFocusRequest({ ...target, requestId });
  }, []);
  const consumeFocusRequest = useCallback((requestId: number) => {
    setFocusRequest((current) =>
      current?.requestId === requestId ? null : current
    );
  }, []);

  return {
    consumeFocusRequest,
    focusCatalog: () => focus({ kind: "catalog" }),
    focusOrdinaryIssue: (id: string) =>
      focus({ id, kind: "ordinary-issue" }),
    focusOrdinaryRepository: (id: string) =>
      focus({ id, kind: "ordinary-repository" }),
    focusRequest,
    focusBuiltIn: (id: string) => focus({ id, kind: "built-in" }),
  };
}
