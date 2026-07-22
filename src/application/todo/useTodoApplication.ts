// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createTodoParseIndex,
  type TodoParseIndex,
} from "../../../todo/indexes/todoParseIndex";
import type {
  TodoCollectionId,
  TodoContent,
} from "../../../todo/model/todoContent";
import { resolveTodoCollectionSelection } from "../../../todo/queries/todoQueries";
import {
  createTodoMutationActions,
  requireTodoContent,
  resolveRequestedTodoSelectionAfterDelete,
  type TodoApplicationServices,
  type TodoDeleteCollectionMutationResult,
  type TodoSystemRepositorySession,
} from "./todoApplication";
import {
  createTodoViewModel,
  type TodoActiveBodyPosition,
  type TodoFocusRequest,
  type TodoViewModel,
} from "./todoViewModel";

export type TodoApplication =
  | { reload: () => Promise<void>; status: "unavailable" }
  | { status: "loading" }
  | { errorMessage: string; reload: () => Promise<void>; status: "failed" }
  | { reload: () => Promise<void>; status: "ready"; view: TodoViewModel };

type ParsedTodoState = {
  content: TodoContent;
  index: TodoParseIndex;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The todo content could not be loaded.";
}

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
  session: TodoSystemRepositorySession;
}): TodoApplication {
  const [requestedCollectionId, setRequestedCollectionId] =
    useState<TodoCollectionId | null>(null);
  const [focusRequest, setFocusRequest] = useState<TodoFocusRequest | null>(null);
  const [activeBodyPosition, setActiveBodyPosition] =
    useState<TodoActiveBodyPosition | null>(null);
  const nextFocusRequestIdRef = useRef(1);
  const previousIndexRef = useRef<TodoParseIndex | null>(null);
  const sessionContent = session.state.status === "ready"
    ? session.state.content
    : null;
  const parsedResult = useMemo(() => {
    if (!sessionContent) return { parsed: null, errorMessage: "" };
    try {
      const content = requireTodoContent(sessionContent);

      return {
        errorMessage: "",
        parsed: {
          content,
          index: createTodoParseIndex(content, previousIndexRef.current),
        } satisfies ParsedTodoState,
      };
    } catch (error) {
      return { parsed: null, errorMessage: getErrorMessage(error) };
    }
  }, [sessionContent]);
  const parsed = parsedResult.parsed;
  const activeCollectionId = parsed
    ? resolveTodoCollectionSelection(parsed.content, requestedCollectionId)
    : null;

  useEffect(() => {
    if (parsed) previousIndexRef.current = parsed.index;
  }, [parsed]);

  useEffect(() => {
    if (parsed && requestedCollectionId !== activeCollectionId) {
      setRequestedCollectionId(activeCollectionId);
    }
  }, [activeCollectionId, parsed, requestedCollectionId]);

  useEffect(() => {
    if (
      focusRequest &&
      (!parsed || !parsed.content.collections.some(
        ({ id }) => id === focusRequest.collectionId,
      ))
    ) {
      setFocusRequest(null);
    }
  }, [focusRequest, parsed]);

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
    if (!parsed?.content.collections.some(({ id }) => id === collectionId)) {
      return;
    }
    setRequestedCollectionId(collectionId);
    setFocusRequest(null);
    setActiveBodyPosition(null);
  }, [parsed]);
  const openCollectionLine = useCallback((
    collectionId: TodoCollectionId,
    lineNumber: number,
  ) => {
    if (parsed?.content.collections.some(({ id }) => id === collectionId)) {
      issueFocusRequest(collectionId, lineNumber);
    }
  }, [issueFocusRequest, parsed]);
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
  const readyState = session.state.status === "ready" ? session.state : null;
  const view = useMemo(() =>
    parsed && readyState
      ? createTodoViewModel({
          activeBodyPosition,
          activeCollectionId,
          consumeFocusRequest,
          content: parsed.content,
          focusRequest,
          index: parsed.index,
          ...mutations,
          openCollectionLine,
          persistence: readyState.persistence,
          selectCollection,
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
      parsed,
      readyState,
      selectCollection,
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
      return view
        ? { reload: session.reload, status: "ready", view }
        : {
            errorMessage:
              parsedResult.errorMessage || "The todo content is unavailable.",
            reload: session.reload,
            status: "failed",
          };
  }
}
