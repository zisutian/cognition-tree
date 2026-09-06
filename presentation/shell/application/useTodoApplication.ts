// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type TodoParseIndex,
  resolveTodoCollectionSelection,
} from "../../../core/todo/index.ts";
import type {
  TodoCollectionId,
  TodoContent,
} from "../../../core/todo/index.ts";

import {
  createTodoMutationActions,
  resolveRequestedTodoSelectionAfterDelete,
  type TodoApplicationServices,
  type TodoDeleteCollectionMutationResult,
  type TodoRepositorySession,
  createTodoViewModel,
  type TodoActiveBodyPosition,
  type TodoFocusRequest,
} from "../../../application/todo/index.ts";
import type { TodoApplication } from "../../../application/todo/index.ts";


export type { TodoApplication } from "../../../application/todo/index.ts";

type PreparedTodoState = {
  content: TodoContent;
  index: TodoParseIndex;
};

function normalizeLineNumber(lineNumber: number) {
  return Number.isFinite(lineNumber)
    ? Math.max(1, Math.floor(lineNumber))
    : 1;
}

export function useTodoApplication({
  services,
  session,
}: {
  services: TodoApplicationServices;
  session: TodoRepositorySession;
}): TodoApplication {
  const [requestedCollectionId, setRequestedCollectionId] =
    useState<TodoCollectionId | null>(null);
  const [focusRequest, setFocusRequest] = useState<TodoFocusRequest | null>(null);
  const [activeBodyPosition, setActiveBodyPosition] =
    useState<TodoActiveBodyPosition | null>(null);
  const [today, setToday] = useState(() => services.localCalendar.today());
  const nextFocusRequestIdRef = useRef(1);
  const readyState = session.state.status === "ready" ? session.state : null;
  const prepared = useMemo(() => readyState
    ? {
        content: readyState.content,
        index: readyState.projection,
      } satisfies PreparedTodoState
    : null, [readyState]);
  const activeCollectionId = prepared
    ? resolveTodoCollectionSelection(prepared.content, requestedCollectionId)
    : null;

  useEffect(() => {
    const updateToday = () => setToday(services.localCalendar.today());

    updateToday();
    return services.localCalendar.subscribe(updateToday);
  }, [services.localCalendar]);

  useEffect(() => {
    if (prepared && requestedCollectionId !== activeCollectionId) {
      setRequestedCollectionId(activeCollectionId);
    }
  }, [activeCollectionId, prepared, requestedCollectionId]);

  useEffect(() => {
    if (
      focusRequest &&
      (!prepared || !prepared.content.collections.some(
        ({ id }) => id === focusRequest.collectionId,
      ))
    ) {
      setFocusRequest(null);
    }
  }, [focusRequest, prepared]);

  const issueFocusRequest = useCallback((
    collectionId: TodoCollectionId,
    lineNumber: number,
  ) => {
    const request: TodoFocusRequest = {
      collectionId,
      lineNumber: normalizeLineNumber(lineNumber),
      requestId: nextFocusRequestIdRef.current++,
    };

    setRequestedCollectionId(collectionId);
    setActiveBodyPosition({ collectionId, lineNumber: request.lineNumber });
    setFocusRequest(request);
  }, []);
  const onCollectionCreated = useCallback((collectionId: TodoCollectionId) => {
    issueFocusRequest(collectionId, 1);
  }, [issueFocusRequest]);
  const onCollectionDeleted = useCallback(
    (result: TodoDeleteCollectionMutationResult) => {
      setRequestedCollectionId((current) =>
        resolveRequestedTodoSelectionAfterDelete({
          ...result,
          requestedCollectionId: current,
        })
      );
      setFocusRequest((current) =>
        current?.collectionId === result.deletedCollectionId ? null : current
      );
      setActiveBodyPosition((current) =>
        current?.collectionId === result.deletedCollectionId ? null : current
      );
    },
    [],
  );
  const mutations = useMemo(
    () => createTodoMutationActions({
      onCollectionCreated,
      onCollectionDeleted,
      services,
      session,
    }),
    [onCollectionCreated, onCollectionDeleted, services, session],
  );
  const selectCollection = useCallback((collectionId: TodoCollectionId) => {
    if (!prepared?.content.collections.some(({ id }) => id === collectionId)) {
      return;
    }
    setRequestedCollectionId(collectionId);
    setFocusRequest(null);
    setActiveBodyPosition(null);
  }, [prepared]);
  const openCollectionLine = useCallback((
    collectionId: TodoCollectionId,
    lineNumber: number,
  ) => {
    if (prepared?.content.collections.some(({ id }) => id === collectionId)) {
      issueFocusRequest(collectionId, lineNumber);
    }
  }, [issueFocusRequest, prepared]);
  const consumeFocusRequest = useCallback((requestId: number) => {
    setFocusRequest((current) =>
      current?.requestId === requestId ? null : current
    );
  }, []);
  const updateActiveBodyLine = useCallback((lineNumber: number) => {
    if (!activeCollectionId) {
      setActiveBodyPosition(null);
      return;
    }
    const normalized = normalizeLineNumber(lineNumber);

    setActiveBodyPosition((current) =>
      current?.collectionId === activeCollectionId &&
        current.lineNumber === normalized
        ? current
        : { collectionId: activeCollectionId, lineNumber: normalized }
    );
  }, [activeCollectionId]);
  const view = useMemo(() =>
    prepared && readyState
      ? createTodoViewModel({
          activeBodyPosition,
          activeCollectionId,
          consumeFocusRequest,
          content: prepared.content,
          focusRequest,
          index: prepared.index,
          ...mutations,
          openCollectionLine,
          persistence: readyState.persistence,
          selectCollection,
          today,
          updateActiveBodyLine,
        })
      : null,
    [
      activeBodyPosition,
      activeCollectionId,
      consumeFocusRequest,
      focusRequest,
      mutations,
      openCollectionLine,
      prepared,
      readyState,
      selectCollection,
      today,
      updateActiveBodyLine,
    ],
  );

  switch (session.state.status) {
    case "unavailable":
      return { reload: session.reload, status: "unavailable" };
    case "loading":
      return { status: "loading" };
    case "failed":
      return {
        errorMessage: session.state.errorMessage,
        reload: session.reload,
        status: "failed",
      };
    case "ready":
      if (!view) {
        throw new Error("Prepared Todo ready state has no view.");
      }
      return { reload: session.reload, status: "ready", view };
  }
}
