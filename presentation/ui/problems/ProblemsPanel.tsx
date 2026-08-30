import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronRight,
  CircleX,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  UiWorkbenchOperationalProblem,
  UiWorkbenchProblem,
  UiWorkbenchProblems,
} from "../../../application/workbench/problems/workbenchProblems";
import { SymbolSlot, cx } from "../shared/primitives";
import { ChoiceGroup } from "../shared/controls";
import {
  ToolList,
  ToolListRow,
  ToolToolbar,
} from "../shared/ToolSurface";
import {
  shouldVirtualizeUiRows,
  uiVirtualOverscan,
  uiVirtualRowHeightPx,
} from "../shared/virtualListMetrics";

function isOperationalProblem(
  problem: UiWorkbenchProblem,
): problem is UiWorkbenchOperationalProblem {
  return problem.target.kind === "operational-error";
}

const sourceLabels: Record<UiWorkbenchProblem["source"], string> = {
  agent: "Agent",
  api: "API",
  document: "笔记",
  name: "名称",
  reference: "引用",
  repository: "仓库",
  settings: "设置",
  sync: "同步",
  syntax: "语法",
  "ui-action": "操作",
  "workspace-reference": "跨仓引用",
};

function getProblemSourceLabel(problem: UiWorkbenchProblem) {
  if (problem.target.kind === "portable-name") {
    return problem.target.owner === "todo"
      ? "代办名称"
      : problem.target.owner === "repository"
        ? "仓库名称"
        : problem.target.entity === "note"
          ? "笔记名称"
          : "文件夹名称";
  }
  if (problem.target.kind === "todo-collection-line") {
    return "代办";
  }
  if (problem.target.kind === "system-syntax") {
    return "语法";
  }
  if (problem.target.kind === "journal-entry-line") {
    return problem.source === "reference"
      ? "日记引用"
      : problem.source === "workspace-reference"
        ? "跨仓引用"
        : "日记";
  }
  return sourceLabels[problem.source];
}

function ProblemRow({
  onCopyRequestId,
  onDismiss,
  problem,
  onOpen,
  style,
}: {
  problem: UiWorkbenchProblem;
  onCopyRequestId?: (requestId: string) => void;
  onOpen: (problem: UiWorkbenchProblem) => void;
  onDismiss: (problem: UiWorkbenchProblem) => void;
  style?: CSSProperties;
}) {
  const isError = problem.severity === "error";
  const operational = isOperationalProblem(problem) ? problem : null;

  return (
    <ToolListRow
      actions={operational ? (
        <>
          {operational.requestId && onCopyRequestId ? (
            <button
              aria-label={`复制请求编号：${operational.requestId}`}
              onClick={() => onCopyRequestId(operational.requestId!)}
              title={operational.requestId}
              type="button"
            >
              复制编号
            </button>
          ) : null}
          <button
            aria-label={`关闭操作错误：${problem.message}`}
            onClick={() => onDismiss(problem)}
            type="button"
          >
            关闭
          </button>
        </>
      ) : null}
      buttonProps={{
        "aria-label": `打开问题：${problem.message}`,
        title: `${problem.message} · ${problem.locationLabel}`,
      }}
      flow="single-line"
      leading={(
        <SymbolSlot
          aria-label={isError ? "错误" : "警告"}
          tone={isError ? "danger" : "warning"}
        >
          {isError ? (
            <CircleX aria-hidden="true" size={13} strokeWidth={2} />
          ) : (
            <TriangleAlert aria-hidden="true" size={13} strokeWidth={2} />
          )}
        </SymbolSlot>
      )}
      main={problem.message}
      meta={(
        <>
          {getProblemSourceLabel(problem)} · {problem.locationLabel}
          {operational && operational.occurrenceCount > 1
            ? ` · ${operational.occurrenceCount} 次 · 最近 ${operational.lastOccurredAt.slice(11, 19)}`
            : ""}
        </>
      )}
      onSelect={() => onOpen(problem)}
      style={style}
    />
  );
}

function ProblemsList({
  onCopyRequestId,
  onDismiss,
  problems,
  onOpen,
}: {
  problems: UiWorkbenchProblem[];
  onCopyRequestId?: (requestId: string) => void;
  onOpen: (problem: UiWorkbenchProblem) => void;
  onDismiss: (problem: UiWorkbenchProblem) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtual = shouldVirtualizeUiRows(problems.length);
  const virtualizer = useVirtualizer({
    count: virtual ? problems.length : 0,
    estimateSize: () => uiVirtualRowHeightPx,
    getItemKey: (index) => problems[index]?.id ?? index,
    getScrollElement: () => scrollRef.current,
    overscan: uiVirtualOverscan,
  });

  if (!virtual) {
    return (
      <div className="problems-collection-scroll ui-scroll-surface">
        <ToolList aria-label="问题列表">
          {problems.map((problem) => (
            <ProblemRow
              key={problem.id}
              onCopyRequestId={onCopyRequestId}
              onDismiss={onDismiss}
              onOpen={onOpen}
              problem={problem}
            />
          ))}
        </ToolList>
      </div>
    );
  }

  return (
    <div
      className="problems-collection-scroll ui-scroll-surface"
      data-virtual-row-count={problems.length}
      ref={scrollRef}
    >
      <ToolList
        aria-label="问题列表"
        className="problems-virtual-collection"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const problem = problems[virtualRow.index];

          return problem ? (
            <ProblemRow
              key={virtualRow.key}
              onCopyRequestId={onCopyRequestId}
              onDismiss={onDismiss}
              onOpen={onOpen}
              problem={problem}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            />
          ) : null;
        })}
      </ToolList>
    </div>
  );
}

export function ProblemsPanel({
  expanded,
  view,
  onCopyRequestId,
  onDismiss = () => undefined,
  onOpen,
  onToggle,
  statusMessage = "",
}: {
  expanded: boolean;
  view: UiWorkbenchProblems;
  onCopyRequestId?: (requestId: string) => void;
  onDismiss?: (problem: UiWorkbenchProblem) => void;
  onOpen: (problem: UiWorkbenchProblem) => void;
  onToggle: () => void;
  statusMessage?: string;
}) {
  const [sourceFilter, setSourceFilter] = useState<"all" | UiWorkbenchProblem["source"]>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | "error" | "warning">("all");
  const [retryFilter, setRetryFilter] = useState<"all" | "retryable" | "terminal">("all");
  const filteredProblems = useMemo(() => view.problems.filter((problem) => {
    if (sourceFilter !== "all" && problem.source !== sourceFilter) return false;
    if (severityFilter !== "all" && problem.severity !== severityFilter) {
      return false;
    }
    if (retryFilter === "all") return true;
    if (!isOperationalProblem(problem)) return false;
    return retryFilter === "retryable" ? problem.retryable : !problem.retryable;
  }), [retryFilter, severityFilter, sourceFilter, view.problems]);
  const toggleLabel = expanded ? "折叠问题面板" : "展开问题面板";
  const statusLabel = statusMessage ? `，${statusMessage}` : "";

  return (
    <section className={cx("problems-panel", expanded && "is-expanded")}>
      <button
        aria-expanded={expanded}
        aria-label={`${toggleLabel}，${view.errorCount} 个错误，${view.warningCount} 个警告${statusLabel}`}
        className="problems-panel-header"
        onClick={onToggle}
        title={toggleLabel}
        type="button"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" size={13} />
        ) : (
          <ChevronRight aria-hidden="true" size={13} />
        )}
        <span className="problems-panel-title">问题</span>
        <span className="problems-panel-count problems-panel-error-count">
          <CircleX aria-hidden="true" size={12} />
          {view.errorCount}
        </span>
        <span className="problems-panel-count problems-panel-warning-count">
          <TriangleAlert aria-hidden="true" size={12} />
          {view.warningCount}
        </span>
        {statusMessage ? (
          <span aria-live="polite" className="problems-panel-status">
            {statusMessage}
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="problems-panel-body">
          <ToolToolbar aria-label="问题筛选">
            <label>
              来源
              <ChoiceGroup
                ariaLabel="按来源筛选问题"
                mode="single"
                onChange={(value: "all" | UiWorkbenchProblem["source"]) => setSourceFilter(value)}
                options={[
                  { label: "全部", value: "all" },
                  ...Object.entries(sourceLabels).map(([source, label]) => ({
                    label,
                    value: source as UiWorkbenchProblem["source"],
                  })),
                ]}
                value={sourceFilter}
              />
            </label>
            <label>
              严重度
              <ChoiceGroup
                ariaLabel="按严重度筛选问题"
                mode="single"
                onChange={(value: "all" | "error" | "warning") => setSeverityFilter(value)}
                options={[
                  { label: "全部", value: "all" },
                  { label: "错误", value: "error" },
                  { label: "警告", value: "warning" },
                ]}
                value={severityFilter}
              />
            </label>
            <label>
              重试性
              <ChoiceGroup
                ariaLabel="按可重试性筛选问题"
                mode="single"
                onChange={(value: "all" | "retryable" | "terminal") => setRetryFilter(value)}
                options={[
                  { label: "全部", value: "all" },
                  { label: "可重试", value: "retryable" },
                  { label: "不可自动重试", value: "terminal" },
                ]}
                value={retryFilter}
              />
            </label>
          </ToolToolbar>
          {filteredProblems.length > 0 ? (
            <ProblemsList
              onCopyRequestId={onCopyRequestId}
              onDismiss={onDismiss}
              onOpen={onOpen}
              problems={filteredProblems}
            />
          ) : (
            <p className="problems-empty">
              {view.status === "collecting"
                ? "正在检查…"
                : view.problems.length > 0
                  ? "没有符合筛选条件的问题。"
                  : "没有问题。"}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
