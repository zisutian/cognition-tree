import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronRight,
  CircleX,
  TriangleAlert,
} from "lucide-react";
import { useRef, type CSSProperties } from "react";
import type {
  UiWorkbenchProblem,
  UiWorkbenchProblems,
} from "../../application/problems/workbenchProblems";
import { SymbolSlot, cx } from "../shared/primitives";

export const problemsRowHeightPx = 22;
export const problemsVirtualizationThreshold = 500;

const sourceLabels: Record<UiWorkbenchProblem["source"], string> = {
  document: "笔记",
  reference: "引用",
  repository: "仓库",
  syntax: "语法",
};

function getProblemSourceLabel(problem: UiWorkbenchProblem) {
  if (problem.target.kind === "journal-entry-line") {
    return problem.source === "reference" ? "日记引用" : "日记";
  }
  return sourceLabels[problem.source];
}

export function shouldVirtualizeProblems(diagnosticCount: number) {
  return diagnosticCount > problemsVirtualizationThreshold;
}

function ProblemRow({
  problem,
  onOpen,
  style,
}: {
  problem: UiWorkbenchProblem;
  onOpen: (problem: UiWorkbenchProblem) => void;
  style?: CSSProperties;
}) {
  const isError = problem.severity === "error";

  return (
    <li className="problems-list-item" style={style}>
      <button
        className="problems-row"
        onClick={() => onOpen(problem)}
        title={`${problem.message} · ${problem.locationLabel}`}
        type="button"
      >
        <SymbolSlot
          aria-label={isError ? "错误" : "警告"}
          className="problems-row-marker"
          tone={isError ? "danger" : "warning"}
        >
          {isError ? (
            <CircleX aria-hidden="true" size={13} strokeWidth={2} />
          ) : (
            <TriangleAlert aria-hidden="true" size={13} strokeWidth={2} />
          )}
        </SymbolSlot>
        <span className="problems-row-message">{problem.message}</span>
        <span className="problems-row-meta">
          {getProblemSourceLabel(problem)} · {problem.locationLabel}
        </span>
      </button>
    </li>
  );
}

function ProblemsList({
  problems,
  onOpen,
}: {
  problems: UiWorkbenchProblem[];
  onOpen: (problem: UiWorkbenchProblem) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtual = shouldVirtualizeProblems(problems.length);
  const virtualizer = useVirtualizer({
    count: virtual ? problems.length : 0,
    estimateSize: () => problemsRowHeightPx,
    getItemKey: (index) => problems[index]?.id ?? index,
    getScrollElement: () => scrollRef.current,
    overscan: 12,
  });

  if (!virtual) {
    return (
      <div className="problems-list-scroll ui-scroll-surface">
        <ul aria-label="问题列表" className="problems-list">
          {problems.map((problem) => (
            <ProblemRow
              key={problem.id}
              onOpen={onOpen}
              problem={problem}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      className="problems-list-scroll ui-scroll-surface"
      data-virtual-row-count={problems.length}
      ref={scrollRef}
    >
      <ul
        aria-label="问题列表"
        className="problems-list problems-list-virtual"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const problem = problems[virtualRow.index];

          return problem ? (
            <ProblemRow
              key={virtualRow.key}
              onOpen={onOpen}
              problem={problem}
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            />
          ) : null;
        })}
      </ul>
    </div>
  );
}

export function ProblemsPanel({
  expanded,
  view,
  onOpen,
  onToggle,
}: {
  expanded: boolean;
  view: UiWorkbenchProblems;
  onOpen: (problem: UiWorkbenchProblem) => void;
  onToggle: () => void;
}) {
  const toggleLabel = expanded ? "折叠问题面板" : "展开问题面板";
  const statusLabel = view.status === "collecting" ? "，正在检查" : "";

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
        {view.status === "collecting" ? (
          <span className="problems-panel-status">正在检查…</span>
        ) : null}
      </button>
      {expanded ? (
        <div className="problems-panel-body">
          {view.problems.length > 0 ? (
            <ProblemsList onOpen={onOpen} problems={view.problems} />
          ) : (
            <p className="problems-empty">
              {view.status === "collecting" ? "正在检查…" : "没有问题。"}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
