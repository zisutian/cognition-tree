import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  globalWorkbenchSessionId,
  type RepositorySessionKey,
  RepositorySessionStoreRegistry,
} from "./repositorySessionStore.ts";

const RepositorySessionStoreContext =
  createContext<RepositorySessionStoreRegistry | null>(null);

export function RepositorySessionStateProvider({
  children,
  repositoryIds,
}: {
  children: ReactNode;
  repositoryIds: readonly string[] | null;
}) {
  const registryRef = useRef<RepositorySessionStoreRegistry | null>(null);

  registryRef.current ??= new RepositorySessionStoreRegistry();
  useEffect(() => {
    if (repositoryIds === null) return;
    registryRef.current?.retainRepositoryIds(new Set([
      globalWorkbenchSessionId,
      ...repositoryIds,
    ]));
  }, [repositoryIds]);
  return createElement(
    RepositorySessionStoreContext.Provider,
    { value: registryRef.current },
    children,
  );
}

export function useRepositorySessionState<Value>(
  sessionKey: RepositorySessionKey<Value>,
  repositoryId: string,
  createInitial: () => Value,
): readonly [Value, Dispatch<SetStateAction<Value>>] {
  const registry = useContext(RepositorySessionStoreContext);

  if (!registry) {
    throw new Error(
      "Repository session state requires its page-session provider.",
    );
  }
  const store = registry.get(sessionKey, createInitial);
  const getSnapshot = useCallback(
    () => store.read(repositoryId),
    [repositoryId, store],
  );
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(repositoryId, listener),
    [repositoryId, store],
  );
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setValue = useCallback<Dispatch<SetStateAction<Value>>>(
    (update) => {
      store.update(repositoryId, update);
    },
    [repositoryId, store],
  );

  return [value, setValue] as const;
}
