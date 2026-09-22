import { Toolbar as ToolToolbar } from "compact-ui";
import {
  ChoiceGroup,
  List,
  ContextRow,
  EmptyState,
  Stack,
  StatusText,
  SubButton,
  useDesignConfig,
} from "compact-ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CircleX, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type {
  UiWorkbenchOperationalProblem,
  UiWorkbenchProblem,
  UiWorkbenchProblems,
} from "../../../application/workbench/index.ts";

import contentStyles from "../shared/Content.module.css";

import { createClassNames } from "../shared/classNames.ts";

import {
  shouldVirtualizeUiRows,
  uiVirtualOverscan,
  uiVirtualRowHeightPx,
} from "../shared/virtualListMetrics.ts";
import problemsPanelStyles from "./ProblemsPanel.module.css";
const cx = createClassNames(problemsPanelStyles, contentStyles);

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
  selected,
}: {
  problem: UiWorkbenchProblem;
  onCopyRequestId?: (requestId: string) => void;
  onOpen: (problem: UiWorkbenchProblem) => void;
  onDismiss: (problem: UiWorkbenchProblem) => void;
  selected: boolean;
}) {
  const { colors } = useDesignConfig();
  const isError = problem.severity === "error";
  const operational = isOperationalProblem(problem) ? problem : null;

  return (
    <ContextRow
      selected={selected}
      actions={
        operational ? (
          <>
            {operational.requestId && onCopyRequestId ? (
              <SubButton
                iconOnly={false}
                aria-label={`复制请求编号：${operational.requestId}`}
                onClick={() => onCopyRequestId(operational.requestId!)}
                title={operational.requestId}
                type="button"
              >
                复制编号
              </SubButton>
            ) : null}
            <SubButton
              iconOnly={false}
              aria-label={`关闭操作错误：${problem.message}`}
              onClick={() => onDismiss(problem)}
              type="button"
            >
              关闭
            </SubButton>
          </>
        ) : null
      }
      icon={
        isError ? (
          <CircleX role="img" aria-label="错误" color={colors.error} />
        ) : (
          <TriangleAlert role="img" aria-label="警告" color={colors.warning} />
        )
      }
      children={
        <span
          aria-label={`打开问题：${problem.message}`}
          title={`${problem.message} · ${problem.locationLabel}`}
        >
          {problem.message} · {getProblemSourceLabel(problem)} ·{" "}
          {problem.locationLabel}
          {operational && operational.occurrenceCount > 1
            ? ` · ${operational.occurrenceCount} 次 · 最近 ${operational.lastOccurredAt.slice(11, 19)}`
            : ""}
        </span>
      }
      onSelect={() => onOpen(problem)}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const virtual = shouldVirtualizeUiRows(problems.length);
  const virtualizer = useVirtualizer({
    count: virtual ? problems.length : 0,
    estimateSize: () => uiVirtualRowHeightPx,
    getItemKey: (index) => problems[index]?.id ?? index,
    getScrollElement: () => scrollRef.current,
    overscan: uiVirtualOverscan,
  });
  const rows = virtualizer.getVirtualItems();
  const visible = virtual
    ? rows.flatMap((row) => (problems[row.index] ? [problems[row.index]] : []))
    : problems;
  return (
    <div
      className={cx("problems-collection-scroll")}
      ref={scrollRef}
      data-virtual-row-count={virtual ? problems.length : undefined}
    >
      <List aria-label="问题列表">
        {virtual && rows.length > 0 ? (
          <li role="presentation" style={{ height: rows[0].start }} />
        ) : null}
        {visible.map((problem) => (
          <ProblemRow
            key={problem.id}
            problem={problem}
            selected={selectedId === problem.id}
            onCopyRequestId={onCopyRequestId}
            onDismiss={onDismiss}
            onOpen={(value) => {
              setSelectedId(value.id);
              onOpen(value);
            }}
          />
        ))}
        {virtual && rows.length > 0 ? (
          <li
            role="presentation"
            style={{ height: virtualizer.getTotalSize() - rows.at(-1)!.end }}
          />
        ) : null}
      </List>
    </div>
  );
}

export type ProblemsFilters = {
  source: "all" | UiWorkbenchProblem["source"];
  severity: "all" | "error" | "warning";
  retry: "all" | "retryable" | "terminal";
};
export const initialProblemsFilters: ProblemsFilters = {
  source: "all",
  severity: "all",
  retry: "all",
};

export function ProblemsPanel({
  expanded,
  filters,
  onFiltersChange,
  view,
  onCopyRequestId,
  onDismiss = () => undefined,
  onOpen,
}: {
  expanded: boolean;
  filters: ProblemsFilters;
  onFiltersChange(filters: ProblemsFilters): void;
  view: UiWorkbenchProblems;
  onCopyRequestId?: (requestId: string) => void;
  onDismiss?: (problem: UiWorkbenchProblem) => void;
  onOpen: (problem: UiWorkbenchProblem) => void;
}) {
  const {
    source: sourceFilter,
    severity: severityFilter,
    retry: retryFilter,
  } = filters;
  const filteredProblems = useMemo(
    () =>
      view.problems.filter((problem) => {
        if (sourceFilter !== "all" && problem.source !== sourceFilter)
          return false;
        if (severityFilter !== "all" && problem.severity !== severityFilter) {
          return false;
        }
        if (retryFilter === "all") return true;
        if (!isOperationalProblem(problem)) return false;
        return retryFilter === "retryable"
          ? problem.retryable
          : !problem.retryable;
      }),
    [retryFilter, severityFilter, sourceFilter, view.problems],
  );
  return (
    <Stack fill gap="tight">
      {expanded ? (
        <>
          <ToolToolbar aria-label="问题筛选">
            <Stack gap="none">
              <StatusText>来源</StatusText>
              <ChoiceGroup
                aria-label="按来源筛选问题"
                mode="single"
                onChange={(value: "all" | UiWorkbenchProblem["source"]) =>
                  onFiltersChange({ ...filters, source: value })
                }
                options={[
                  { label: "全部", value: "all" },
                  ...Object.entries(sourceLabels).map(([source, label]) => ({
                    label,
                    value: source as UiWorkbenchProblem["source"],
                  })),
                ]}
                value={sourceFilter}
              />
            </Stack>
            <Stack gap="none">
              <StatusText>严重度</StatusText>
              <ChoiceGroup
                aria-label="按严重度筛选问题"
                mode="single"
                onChange={(value: "all" | "error" | "warning") =>
                  onFiltersChange({ ...filters, severity: value })
                }
                options={[
                  { label: "全部", value: "all" },
                  { label: "错误", value: "error" },
                  { label: "警告", value: "warning" },
                ]}
                value={severityFilter}
              />
            </Stack>
            <Stack gap="none">
              <StatusText>重试性</StatusText>
              <ChoiceGroup
                aria-label="按可重试性筛选问题"
                mode="single"
                onChange={(value: "all" | "retryable" | "terminal") =>
                  onFiltersChange({ ...filters, retry: value })
                }
                options={[
                  { label: "全部", value: "all" },
                  { label: "可重试", value: "retryable" },
                  { label: "不可自动重试", value: "terminal" },
                ]}
                value={retryFilter}
              />
            </Stack>
          </ToolToolbar>
          {filteredProblems.length > 0 ? (
            <ProblemsList
              onCopyRequestId={onCopyRequestId}
              onDismiss={onDismiss}
              onOpen={onOpen}
              problems={filteredProblems}
            />
          ) : (
            <EmptyState
              title={
                view.status === "collecting"
                  ? "正在检查…"
                  : view.problems.length > 0
                    ? "没有符合筛选条件的问题。"
                    : "没有问题。"
              }
            />
          )}
        </>
      ) : null}
    </Stack>
  );
}
