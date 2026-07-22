// SPDX-License-Identifier: GPL-3.0-or-later

export type WorkbenchFeedbackError<Scope extends string> = {
  id: string;
  message: string;
  scope: Scope;
  sequence: number;
};

export type WorkbenchTransientFeedback<Scope extends string> = {
  id: string;
  message: string;
  scope: Scope;
  tone: "error" | "info";
};

export type WorkbenchFeedbackSnapshot<Scope extends string> = {
  errors: readonly WorkbenchFeedbackError<Scope>[];
  transient: WorkbenchTransientFeedback<Scope> | null;
};

export type WorkbenchFeedbackController<Scope extends string> = {
  dismiss(id: string): void;
  dismissScope(scope: Scope): void;
  dispose(): void;
  getSnapshot(): WorkbenchFeedbackSnapshot<Scope>;
  reportError(scope: Scope, message: string): string;
  reportInfo(scope: Scope, message: string): void;
  subscribe(listener: () => void): () => void;
};

export type WorkbenchFeedbackScheduler = (
  callback: () => void,
  delayMs: number,
) => () => void;

export const workbenchFeedbackDurationMs = 5_000;
export const maximumWorkbenchErrorsPerScope = 20;

function defaultScheduler(callback: () => void, delayMs: number) {
  const timer = setTimeout(callback, delayMs);

  return () => clearTimeout(timer);
}

export function createWorkbenchFeedbackController<Scope extends string>({
  maximumErrorsPerScope = maximumWorkbenchErrorsPerScope,
  schedule = defaultScheduler,
  transientDurationMs = workbenchFeedbackDurationMs,
}: {
  maximumErrorsPerScope?: number;
  schedule?: WorkbenchFeedbackScheduler;
  transientDurationMs?: number;
} = {}): WorkbenchFeedbackController<Scope> {
  if (!Number.isInteger(maximumErrorsPerScope) || maximumErrorsPerScope < 1) {
    throw new Error("Workbench feedback error capacity must be positive.");
  }
  if (!Number.isFinite(transientDurationMs) || transientDurationMs < 0) {
    throw new Error("Workbench feedback duration cannot be negative.");
  }

  const listeners = new Set<() => void>();
  let cancelTransient: (() => void) | null = null;
  let nextId = 1;
  let nextSequence = 1;
  let snapshot: WorkbenchFeedbackSnapshot<Scope> = {
    errors: [],
    transient: null,
  };
  const publish = (next: WorkbenchFeedbackSnapshot<Scope>) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const publishTransient = (
    scope: Scope,
    message: string,
    tone: WorkbenchTransientFeedback<Scope>["tone"],
  ) => {
    cancelTransient?.();
    const id = `feedback-message-${nextId++}`;

    publish({
      ...snapshot,
      transient: { id, message, scope, tone },
    });
    cancelTransient = schedule(() => {
      cancelTransient = null;
      if (snapshot.transient?.id === id) {
        publish({ ...snapshot, transient: null });
      }
    }, transientDurationMs);
  };

  return {
    dismiss(id) {
      const errors = snapshot.errors.filter((error) => error.id !== id);

      if (errors.length !== snapshot.errors.length) {
        publish({ ...snapshot, errors });
      }
    },
    dismissScope(scope) {
      const errors = snapshot.errors.filter((error) => error.scope !== scope);
      const transient = snapshot.transient?.scope === scope
        ? null
        : snapshot.transient;

      if (
        errors.length !== snapshot.errors.length ||
        transient !== snapshot.transient
      ) {
        if (!transient) {
          cancelTransient?.();
          cancelTransient = null;
        }
        publish({ ...snapshot, errors, transient });
      }
    },
    dispose() {
      cancelTransient?.();
      cancelTransient = null;
      listeners.clear();
    },
    getSnapshot() {
      return snapshot;
    },
    reportError(scope, message) {
      const normalizedMessage = message.trim() || "操作失败。";
      const existing = snapshot.errors.find(
        (error) => error.scope === scope && error.message === normalizedMessage,
      );
      const id = existing?.id ?? `feedback-error-${nextId++}`;
      const nextError: WorkbenchFeedbackError<Scope> = {
        id,
        message: normalizedMessage,
        scope,
        sequence: nextSequence++,
      };
      const withoutExisting = snapshot.errors.filter(
        (error) => error.id !== id,
      );
      const scopedErrors = withoutExisting.filter(
        (error) => error.scope === scope,
      );
      const overflow = Math.max(
        0,
        scopedErrors.length + 1 - maximumErrorsPerScope,
      );
      const discardedIds = new Set(
        scopedErrors.slice(0, overflow).map((error) => error.id),
      );
      const errors = [
        ...withoutExisting.filter((error) => !discardedIds.has(error.id)),
        nextError,
      ];

      snapshot = { ...snapshot, errors };
      publishTransient(scope, normalizedMessage, "error");
      return id;
    },
    reportInfo(scope, message) {
      const normalizedMessage = message.trim();

      if (normalizedMessage) {
        publishTransient(scope, normalizedMessage, "info");
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
