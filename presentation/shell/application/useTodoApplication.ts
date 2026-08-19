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
} from "../../../core/todo/indexes/todoParseIndex";
import type {
  TodoCollectionId,
  TodoContent,
} from "../../../core/todo/model/todoContent";
import { resolveTodoCollectionSelection } from "../../../core/todo/queries/todoQueries";
import {
  createTodoMutationActions,
  requireTodoContent,
  resolveRequestedTodoSelectionAfterDelete,
  type TodoApplicationServices,
  type TodoDeleteCollectionMutationResult,
  type TodoRepositorySession,
} from "../../../application/todo/todoApplication";
import type { TodoApplication } from "../../../application/todo/todoApplicationState";
import {
  createTodoViewModel,
  type TodoActiveBodyPosition,
  type TodoFocusRequest,
} from "../../../application/todo/todoViewModel";

export type { TodoApplication } from "../../../application/todo/todoApplicationState";

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
  session: TodoRepositorySession;
}): TodoApplication {
  const [requestedCollectionId, setRequestedCollectionId] =
    useState<TodoCollectionId | null>(null);
  const [focusRequest, setFocusRequest] = useState<TodoFocusRequest | null>(null);
  const [activeBodyPosition, setActiveBodyPosition] =
    useState<TodoActiveBodyPosition | null>(null);
  const [today, setToday] = useState(() => services.localCalendar.today());
  const nextFocusRequestIdRef = useRef(1);
  const sessionContent = session.state.status === "ready"
    ? session.state.content
    : null;
  const parsedResult = useMemo(() => {
    if (!sessionContent || session.state.status !== "ready") {
      return { parsed: null, errorMessage: "" };
    }
    try {
      const content = requireTodoContent(sessionContent);

      return {
        errorMessage: "",
        parsed: {
          content,
          index: session.state.projection,
        } satisfies ParsedTodoState,
      };
    } catch (error) {
      return { parsed: null, errorMessage: getErrorMessage(error) };
    }
  }, [session.state, sessionContent]);
  const parsed = parsedResult.parsed;
  const activeCollectionId = parsed
    ? resolveTodoCollectionSelection(parsed.content, requestedCollectionId)
    : null;

  useEffect(() => {
    const updateToday = () => setToday(services.localCalendar.today());

    updateToday();
    return services.localCalendar.subscribe(updateToday);
  }, [services.localCalendar]);

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
      parsed,
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
