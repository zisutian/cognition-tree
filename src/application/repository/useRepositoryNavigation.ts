import { useCallback, useRef, useState } from "react";

export type RepositoryFocusTarget =
  | { id: string; kind: "ordinary-issue" }
  | { id: string; kind: "ordinary-repository" }
  | { id: string; kind: "system-repository" };

export type RepositoryFocusRequest = RepositoryFocusTarget & {
  requestId: number;
};

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
    focusOrdinaryIssue: (id: string) =>
      focus({ id, kind: "ordinary-issue" }),
    focusOrdinaryRepository: (id: string) =>
      focus({ id, kind: "ordinary-repository" }),
    focusRequest,
    focusSystemRepository: (id: string) =>
      focus({ id, kind: "system-repository" }),
  };
}

export type RepositoryNavigation = ReturnType<typeof useRepositoryNavigation>;
