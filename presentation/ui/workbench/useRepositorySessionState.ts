import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export function useRepositorySessionState<Value>(
  repositoryId: string,
  createInitial: () => Value,
): readonly [Value, Dispatch<SetStateAction<Value>>] {
  const createInitialRef = useRef(createInitial);
  const initialValuesRef = useRef(new Map<string, Value>());
  const [values, setValues] = useState(() => new Map<string, Value>());

  createInitialRef.current = createInitial;
  let value: Value;

  if (values.has(repositoryId)) {
    value = values.get(repositoryId)!;
  } else if (initialValuesRef.current.has(repositoryId)) {
    value = initialValuesRef.current.get(repositoryId)!;
  } else {
    value = createInitialRef.current();
    initialValuesRef.current.set(repositoryId, value);
  }
  const setValue = useCallback<Dispatch<SetStateAction<Value>>>((update) => {
    setValues((current) => {
      let previous: Value;

      if (current.has(repositoryId)) {
        previous = current.get(repositoryId)!;
      } else if (initialValuesRef.current.has(repositoryId)) {
        previous = initialValuesRef.current.get(repositoryId)!;
      } else {
        previous = createInitialRef.current();
        initialValuesRef.current.set(repositoryId, previous);
      }
      const next = typeof update === "function"
        ? (update as (value: Value) => Value)(previous)
        : update;

      if (Object.is(previous, next) && current.has(repositoryId)) return current;
      const updated = new Map(current);

      updated.set(repositoryId, next);
      return updated;
    });
  }, [repositoryId]);

  return [value, setValue] as const;
}
