import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  type RepositorySessionKey,
  RepositorySessionStoreRegistry,
} from "./repositorySessionStore";

const RepositorySessionStoreContext =
  createContext<RepositorySessionStoreRegistry | null>(null);

export function RepositorySessionStateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const registryRef = useRef<RepositorySessionStoreRegistry | null>(null);

  registryRef.current ??= new RepositorySessionStoreRegistry();
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
