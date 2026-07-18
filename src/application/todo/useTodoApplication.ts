// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  TodoCollectionId,
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
  type TodoViewModel,
} from "./todoViewModel";

export type TodoApplication =
  | {
      reload: () => Promise<void>;
      status: "unavailable";
    }
  | {
      status: "loading";
    }
  | {
      errorMessage: string;
      reload: () => Promise<void>;
      status: "failed";
    }
  | {
      reload: () => Promise<void>;
      status: "ready";
      view: TodoViewModel;
    };

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The todo content could not be loaded.";
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
  const sessionContent = session.state.status === "ready"
    ? session.state.content
    : null;
  const parsedResult = useMemo(() => {
    if (!sessionContent) {
      return { content: null, errorMessage: "" };
    }
    try {
      return {
        content: requireTodoContent(sessionContent),
        errorMessage: "",
      };
    } catch (error) {
      return { content: null, errorMessage: getErrorMessage(error) };
    }
  }, [sessionContent]);
  const content = parsedResult.content;
  const activeCollectionId = content
    ? resolveTodoCollectionSelection(content, requestedCollectionId)
    : null;

  useEffect(() => {
    if (content && requestedCollectionId !== activeCollectionId) {
      setRequestedCollectionId(activeCollectionId);
    }
  }, [activeCollectionId, content, requestedCollectionId]);

  const onCollectionCreated = useCallback((collectionId: TodoCollectionId) => {
    setRequestedCollectionId(collectionId);
  }, []);
  const onCollectionDeleted = useCallback(
    (result: TodoDeleteCollectionMutationResult) => {
      setRequestedCollectionId((current) =>
        resolveRequestedTodoSelectionAfterDelete({
          ...result,
          requestedCollectionId: current,
        })
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
    if (!content?.collections.some(({ id }) => id === collectionId)) {
      return;
    }
    setRequestedCollectionId(collectionId);
  }, [content]);
  const readyState = session.state.status === "ready" ? session.state : null;
  const view = useMemo(() =>
    content && readyState
      ? createTodoViewModel({
          activeCollectionId,
          content,
          ...mutations,
          persistence: readyState.persistence,
          selectCollection,
        })
      : null,
    [
      activeCollectionId,
      content,
      mutations,
      readyState,
      selectCollection,
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
        return {
          errorMessage:
            parsedResult.errorMessage || "The todo content is unavailable.",
          reload: session.reload,
          status: "failed",
        };
      }
      return { reload: session.reload, status: "ready", view };
  }
}
