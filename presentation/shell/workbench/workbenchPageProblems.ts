import type {
  UiWorkbenchProblem,
  UiWorkbenchProblems,
} from "../../../application/workbench/index.ts";
import type { ActivityId } from "../../ui/index.ts";
import type { WorkbenchApplication } from "../application/workbenchApplication.ts";

/** Derive current failures from authoritative page state; resolving state removes the row. */
export function projectWorkbenchPageProblems({
  application,
  activeActivityId,
  errorMessage,
  base,
}: {
  application: {
    agent: Pick<WorkbenchApplication["agent"], "state">;
    search: Pick<WorkbenchApplication["search"], "state">;
  };
  activeActivityId: ActivityId;
  errorMessage?: string;
  base: UiWorkbenchProblems;
}): UiWorkbenchProblems {
  const added: UiWorkbenchProblem[] = [];
  const alreadyReported = (
    activity: string,
    message: string,
    sessionId: string | null = null,
  ) =>
    base.problems.some(
      (problem) =>
        problem.message === message &&
        (problem.target.kind === "operational-error"
          ? problem.target.sourceScope === activity &&
            problem.target.sessionId === sessionId
          : problem.target.kind === "agent-problem" &&
            activity === "agent" &&
            problem.target.sessionId === sessionId),
    );
  const pageProblem = (
    activityId: "settings" | "search",
    id: string,
    message: string | null | undefined,
    locationLabel: string,
  ) => {
    if (!message || alreadyReported(activityId, message)) return;
    added.push({
      code: id,
      id: `${activityId}:${id}`,
      message,
      locationLabel,
      severity: "error",
      source: activityId,
      target: { kind: "activity-problem", activityId },
    });
  };
  if (activeActivityId === "settings")
    pageProblem("settings", "current-page", errorMessage, "当前设置页");
  const search = application.search.state;
  pageProblem("search", "request", search.errorMessage, "搜索结果");
  if (activeActivityId === "search" && search.draft.domains.length === 0)
    pageProblem("search", "scope", "至少选择一个范围。", "搜索范围");
  for (const fault of search.faults) {
    const label =
      fault.domain === "workspace"
        ? "笔记"
        : fault.domain === "journal"
          ? "日记"
          : "代办";
    pageProblem(
      "search",
      `source:${fault.domain}:${fault.repositoryId ?? ""}:${fault.code}`,
      fault.message,
      `${label}${fault.repositoryId ? ` · ${fault.repositoryId}` : ""}`,
    );
  }
  const agentProblem = (
    id: string,
    message: string | null,
    sessionId: string | null,
    locationLabel: string,
  ) => {
    if (!message || alreadyReported("agent", message, sessionId)) return;
    added.push({
      code: id,
      id: `agent-state:${id}`,
      message,
      locationLabel,
      severity: "error",
      source: "agent",
      target: { kind: "agent-problem", sessionId },
    });
  };
  agentProblem("load", application.agent.state.errorMessage, null, "会话目录");
  for (const session of application.agent.state.sessions)
    agentProblem(session.id, session.problem, session.id, session.profileLabel);
  const problems = [...base.problems, ...added].sort((left, right) =>
    left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1,
  );
  return { ...base, problems, errorCount: base.errorCount + added.length };
}
