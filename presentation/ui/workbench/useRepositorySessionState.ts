import {
  useCallback,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { RepositorySessionStore } from "./repositorySessionStore";

export function useRepositorySessionState<Value>(
  repositoryId: string,
  createInitial: () => Value,
): readonly [Value, Dispatch<SetStateAction<Value>>] {
  const storeRef = useRef<RepositorySessionStore<Value> | null>(null);

  storeRef.current ??= new RepositorySessionStore(createInitial);
  const store = storeRef.current;
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
