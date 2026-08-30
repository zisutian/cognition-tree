import { useRef, useState } from "react";

export type ExclusiveAsyncActionRunner = Readonly<{
  run<Result>(
    operation: () => PromiseLike<Result> | Result,
  ): Promise<Result> | null;
}>;

export function createExclusiveAsyncActionRunner(
  onBusyChange: (busy: boolean) => void,
): ExclusiveAsyncActionRunner {
  let active = false;

  return {
    run<Result>(operation: () => PromiseLike<Result> | Result) {
      if (active) return null;
      active = true;
      try {
        onBusyChange(true);
      } catch (error) {
        active = false;
        throw error;
      }
      const pending = new Promise<Result>((resolve, reject) => {
        try {
          resolve(operation());
        } catch (error) {
          reject(error);
        }
      });

      void pending.finally(() => {
        active = false;
        onBusyChange(false);
      }).catch(() => undefined);
      return pending;
    },
  };
}

export function useExclusiveAsyncAction() {
  const [busy, setBusy] = useState(false);
  const runnerRef = useRef<ExclusiveAsyncActionRunner | null>(null);

  runnerRef.current ??= createExclusiveAsyncActionRunner(setBusy);
  return { busy, run: runnerRef.current.run } as const;
}
