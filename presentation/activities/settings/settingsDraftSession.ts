// SPDX-License-Identifier: GPL-3.0-or-later

export type SettingsDraftSource<Value> = Readonly<{
  revision: string;
  value: Value;
}>;
export type SettingsDraftSnapshot<Value> = Readonly<{
  baseline: SettingsDraftSource<Value> | null;
  source: SettingsDraftSource<Value> | null;
  draft: Value;
  dirty: boolean;
  stale: boolean;
  submitting: boolean;
  errorMessage: string | null;
}>;

export function settingsValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const a = Object.keys(left),
    b = Object.keys(right);
  return (
    a.length === b.length &&
    a.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        settingsValuesEqual(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
    )
  );
}

/** A page-session draft. The application snapshot remains the saved authority. */
export function createSettingsDraftSession<Value>(initial: Value) {
  let disposed = false;
  let generation = 0;
  let operationId = 0;
  let state: SettingsDraftSnapshot<Value> = {
    baseline: null,
    source: null,
    draft: initial,
    dirty: false,
    stale: false,
    submitting: false,
    errorMessage: null,
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof state>) => {
    if (disposed) return;
    const next = { ...state, ...patch };
    next.dirty = !settingsValuesEqual(
      next.draft,
      next.baseline?.value ?? initial,
    );
    next.stale =
      !!next.baseline && next.baseline.revision !== next.source?.revision;
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    observe(source: SettingsDraftSource<Value> | null) {
      if (
        state.source?.revision === source?.revision &&
        settingsValuesEqual(state.source?.value, source?.value)
      )
        return;
      if (!state.submitting && !state.dirty && source) {
        publish({
          baseline: source,
          source,
          draft: source.value,
          errorMessage: null,
        });
      } else publish({ source });
    },
    change(draft: Value) {
      generation += 1;
      publish({ draft, errorMessage: null });
    },
    discard() {
      if (state.submitting) return;
      generation += 1;
      publish({
        baseline: state.source,
        draft: state.source?.value ?? initial,
        errorMessage: null,
      });
    },
    async submit(
      operation: (
        draft: Value,
        revision: string,
      ) => Promise<SettingsDraftSource<Value>>,
    ) {
      if (disposed || state.submitting || state.stale || !state.baseline)
        return null;
      const id = ++operationId,
        submittedGeneration = generation;
      const { draft, baseline } = state;
      publish({ submitting: true, errorMessage: null });
      try {
        const receipt = await operation(draft, baseline.revision);
        if (disposed || operationId !== id) return null;
        const source =
          state.source?.revision === baseline.revision ||
          state.source?.revision === receipt.revision
            ? receipt
            : state.source;
        publish({
          baseline: receipt,
          source,
          submitting: false,
          draft:
            generation === submittedGeneration ? receipt.value : state.draft,
        });
        return receipt;
      } catch (error) {
        if (!disposed && operationId === id)
          publish({
            submitting: false,
            errorMessage:
              error instanceof Error ? error.message : "保存失败，请重试。",
          });
        throw error;
      }
    },
    resume() {
      disposed = false;
    },
    dispose() {
      disposed = true;
      operationId += 1;
      listeners.clear();
    },
  };
}
