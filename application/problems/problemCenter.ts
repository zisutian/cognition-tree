// SPDX-License-Identifier: GPL-3.0-or-later

import type { ApplicationScheduler } from "../runtime/index.ts";

export type ProblemSeverity = "error" | "warning";
export type ProblemSource = "agent" | "api" | "settings" | "sync" | "ui-action";
export type SafeProblemDetails = Readonly<
  Record<string, boolean | number | string | null | readonly string[]>
>;

export type OperationalProblem<Scope extends string> = Readonly<{
  code: string;
  details: SafeProblemDetails;
  firstOccurredAt: string;
  id: string;
  lastOccurredAt: string;
  message: string;
  occurrenceCount: number;
  path: string | null;
  requestId: string | null;
  retryable: boolean;
  sequence: number;
  severity: ProblemSeverity;
  source: ProblemSource;
  target: Readonly<{
    scope: Scope;
    sessionId: string | null;
  }>;
}>;

export type ProblemReport<Scope extends string> = Readonly<{
  code: string;
  details?: Readonly<Record<string, unknown>>;
  message: string;
  path?: string | null;
  requestId?: string | null;
  retryable?: boolean;
  severity?: ProblemSeverity;
  source: ProblemSource;
  target: Readonly<{
    scope: Scope;
    sessionId?: string | null;
  }>;
}>;

export type ProblemReporter<Scope extends string> = {
  report(problem: ProblemReport<Scope>): string | null;
};

export type ProblemCenterTransient<Scope extends string> =
  | Readonly<{
      id: string;
      message: string;
      scope: Scope;
      tone: "info";
    }>
  | Readonly<{
      id: string;
      problemId: string;
      scope: Scope;
      tone: "error";
    }>;

export type ProblemCenterSnapshot<Scope extends string> = Readonly<{
  problems: readonly OperationalProblem<Scope>[];
  transient: ProblemCenterTransient<Scope> | null;
}>;

export type ProblemCenterController<Scope extends string> =
  ProblemReporter<Scope> & {
    dismiss(id: string): void;
    dismissScope(scope: Scope): void;
    dispose(): void;
    getSnapshot(): ProblemCenterSnapshot<Scope>;
    reportError(scope: Scope, error: unknown): string | null;
    reportInfo(scope: Scope, message: string): void;
    subscribe(listener: () => void): () => void;
  };

export const problemCenterTransientDurationMs = 5_000;
export const maximumOperationalProblems = 200;

function canonicalDetails(details: SafeProblemDetails) {
  return JSON.stringify(Object.keys(details).sort().map((key) => [
    key,
    details[key],
  ]));
}

function sanitizeDetails(
  details: Readonly<Record<string, unknown>> | undefined,
): SafeProblemDetails {
  if (!details) return {};
  const safe: Record<
    string,
    boolean | number | string | null | readonly string[]
  > = {};

  for (const key of Object.keys(details).sort()) {
    const value = details[key];

    if (
      value === null || typeof value === "boolean" ||
      typeof value === "number" || typeof value === "string"
    ) {
      safe[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      safe[key] = [...value];
    }
  }
  return safe;
}

function safeTimestamp(now: () => Date) {
  const value = now();

  return Number.isFinite(value.getTime())
    ? value.toISOString()
    : new Date(0).toISOString();
}

type StructuredClientError = Error & {
  apiCode?: unknown;
  details?: unknown;
  path?: unknown;
  requestId?: unknown;
  retryable?: unknown;
};

function projectError<Scope extends string>(
  scope: Scope,
  error: unknown,
): ProblemReport<Scope> {
  const structured = error instanceof Error
    ? error as StructuredClientError
    : null;
  const details = structured?.details;
  const isApiError = typeof structured?.apiCode === "string";

  return {
    code: isApiError ? structured.apiCode as string : "unexpected_client_error",
    details: details && typeof details === "object" && !Array.isArray(details)
      ? details as Record<string, unknown>
      : {},
    message: error instanceof Error
      ? error.message
      : typeof error === "string" && error.trim()
        ? error
        : "操作失败。",
    path: typeof structured?.path === "string" ? structured.path : null,
    requestId: typeof structured?.requestId === "string"
      ? structured.requestId
      : null,
    retryable: structured?.retryable === true,
    severity: "error",
    source: isApiError ? "api" : "ui-action",
    target: { scope, sessionId: null },
  };
}

export function createProblemCenter<Scope extends string>({
  maximumProblems = maximumOperationalProblems,
  now = () => new Date(),
  scheduler,
  transientDurationMs = problemCenterTransientDurationMs,
}: {
  maximumProblems?: number;
  now?: () => Date;
  scheduler: Pick<ApplicationScheduler, "schedule">;
  transientDurationMs?: number;
}): ProblemCenterController<Scope> {
  if (!Number.isInteger(maximumProblems) || maximumProblems < 1) {
    throw new Error("Problem Center capacity must be positive.");
  }
  if (!Number.isFinite(transientDurationMs) || transientDurationMs < 0) {
    throw new Error("Problem Center transient duration cannot be negative.");
  }

  const listeners = new Set<() => void>();
  let cancelTransient: (() => void) | null = null;
  let disposed = false;
  let nextId = 1;
  let nextSequence = 1;
  let snapshot: ProblemCenterSnapshot<Scope> = {
    problems: [],
    transient: null,
  };
  const publish = (next: ProblemCenterSnapshot<Scope>) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const scheduleTransient = (transient: ProblemCenterTransient<Scope>) => {
    if (disposed) return;
    cancelTransient?.();
    publish({ ...snapshot, transient });
    cancelTransient = scheduler.schedule(() => {
      if (disposed) return;
      cancelTransient = null;
      if (snapshot.transient?.id === transient.id) {
        publish({ ...snapshot, transient: null });
      }
    }, transientDurationMs);
  };

  const controller: ProblemCenterController<Scope> = {
    dismiss(id) {
      if (disposed) return;
      const problems = snapshot.problems.filter((problem) => problem.id !== id);

      if (problems.length !== snapshot.problems.length) {
        publish({ ...snapshot, problems });
      }
    },
    dismissScope(scope) {
      if (disposed) return;
      const problems = snapshot.problems.filter(
        (problem) => problem.target.scope !== scope,
      );
      const transient = snapshot.transient?.scope === scope
        ? null
        : snapshot.transient;

      if (
        problems.length !== snapshot.problems.length ||
        transient !== snapshot.transient
      ) {
        if (!transient) {
          cancelTransient?.();
          cancelTransient = null;
        }
        publish({ problems, transient });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelTransient?.();
      cancelTransient = null;
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    report(report) {
      if (disposed) return null;
      const details = sanitizeDetails(report.details);
      const message = report.message.trim() || "操作失败。";
      const occurredAt = safeTimestamp(now);
      const sessionId = report.target.sessionId ?? null;
      const fingerprint = [
        report.source,
        report.code,
        report.target.scope,
        sessionId ?? "",
        report.path ?? "",
        canonicalDetails(details),
      ].join("\u0000");
      const existing = snapshot.problems.find((problem) =>
        [
          problem.source,
          problem.code,
          problem.target.scope,
          problem.target.sessionId ?? "",
          problem.path ?? "",
          canonicalDetails(problem.details),
        ].join("\u0000") === fingerprint
      );
      const id = existing?.id ?? `problem-${nextId++}`;
      const problem: OperationalProblem<Scope> = {
        code: report.code,
        details,
        firstOccurredAt: existing?.firstOccurredAt ?? occurredAt,
        id,
        lastOccurredAt: occurredAt,
        message,
        occurrenceCount: (existing?.occurrenceCount ?? 0) + 1,
        path: report.path ?? null,
        requestId: report.requestId ?? null,
        retryable: report.retryable ?? false,
        sequence: nextSequence++,
        severity: report.severity ?? "error",
        source: report.source,
        target: { scope: report.target.scope, sessionId },
      };
      const problems = [
        ...snapshot.problems.filter(({ id: problemId }) => problemId !== id),
        problem,
      ].slice(-maximumProblems);

      snapshot = { ...snapshot, problems };
      scheduleTransient({
        id: `transient-${nextId++}`,
        problemId: id,
        scope: report.target.scope,
        tone: "error",
      });
      return id;
    },
    reportError(scope, error) {
      return controller.report(projectError(scope, error));
    },
    reportInfo(scope, message) {
      if (disposed) return;
      const normalized = message.trim();

      if (normalized) {
        scheduleTransient({
          id: `transient-${nextId++}`,
          message: normalized,
          scope,
          tone: "info",
        });
      }
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return controller;
}
