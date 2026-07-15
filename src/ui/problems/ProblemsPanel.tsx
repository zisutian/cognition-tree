import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronRight,
  CircleX,
  TriangleAlert,
} from "lucide-react";
import { useRef, type CSSProperties } from "react";
import type {
  UiWorkbenchDiagnostic,
  UiWorkbenchDiagnostics,
} from "../../application/workspace/projection/viewDiagnostics";
import { SymbolSlot, cx } from "../shared/primitives";

export const problemsRowHeightPx = 22;
export const problemsVirtualizationThreshold = 500;

const sourceLabels: Record<UiWorkbenchDiagnostic["source"], string> = {
  document: "笔记",
  reference: "引用",
  syntax: "语法",
};

export function shouldVirtualizeProblems(diagnosticCount: number) {
  return diagnosticCount > problemsVirtualizationThreshold;
}

function ProblemRow({
  diagnostic,
  onOpen,
  style,
}: {
  diagnostic: UiWorkbenchDiagnostic;
  onOpen: (diagnostic: UiWorkbenchDiagnostic) => void;
  style?: CSSProperties;
}) {
  const isError = diagnostic.severity === "error";

  return (
    <li className="problems-list-item" style={style}>
      <button
        className="problems-row"
        onClick={() => onOpen(diagnostic)}
        title={`${diagnostic.message} · ${diagnostic.locationLabel}`}
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
        <span className="problems-row-message">{diagnostic.message}</span>
        <span className="problems-row-meta">
          {sourceLabels[diagnostic.source]} · {diagnostic.locationLabel}
        </span>
      </button>
    </li>
  );
}

function ProblemsList({
  diagnostics,
  onOpen,
}: {
  diagnostics: UiWorkbenchDiagnostic[];
  onOpen: (diagnostic: UiWorkbenchDiagnostic) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtual = shouldVirtualizeProblems(diagnostics.length);
  const virtualizer = useVirtualizer({
    count: virtual ? diagnostics.length : 0,
    estimateSize: () => problemsRowHeightPx,
    getItemKey: (index) => diagnostics[index]?.id ?? index,
    getScrollElement: () => scrollRef.current,
    overscan: 12,
  });

  if (!virtual) {
    return (
      <div className="problems-list-scroll ui-scroll-surface">
        <ul aria-label="问题列表" className="problems-list">
          {diagnostics.map((diagnostic) => (
            <ProblemRow
              diagnostic={diagnostic}
              key={diagnostic.id}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      className="problems-list-scroll ui-scroll-surface"
      data-virtual-row-count={diagnostics.length}
      ref={scrollRef}
    >
      <ul
        aria-label="问题列表"
        className="problems-list problems-list-virtual"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const diagnostic = diagnostics[virtualRow.index];

          return diagnostic ? (
            <ProblemRow
              diagnostic={diagnostic}
              key={virtualRow.key}
              onOpen={onOpen}
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
  view: UiWorkbenchDiagnostics;
  onOpen: (diagnostic: UiWorkbenchDiagnostic) => void;
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
          {view.diagnostics.length > 0 ? (
            <ProblemsList diagnostics={view.diagnostics} onOpen={onOpen} />
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
