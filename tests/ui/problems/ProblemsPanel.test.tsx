import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UiWorkbenchDiagnostic } from "../../../application/workspace/projection/viewDiagnostics";
import type { UiWorkbenchRepositoryProblem } from "../../../application/problems/workbenchProblems";
import type { JournalDiagnostic } from "../../../application/journal";
import {
  ProblemsPanel,
  problemsVirtualizationThreshold,
  shouldVirtualizeProblems,
} from "../../../presentation/ui/problems/ProblemsPanel";

const diagnostic: UiWorkbenchDiagnostic = {
  code: "unknown-syntax",
  id: "document:note-1:unknown-syntax",
  locationLabel: "示例 · L2:C2",
  message: "缩进行必须使用已配置的行首符号。",
  severity: "error",
  source: "document",
  target: { kind: "note-line", lineNumber: 2, noteId: "note-1" },
};

const repositoryProblem: UiWorkbenchRepositoryProblem = {
  code: "repository_corrupt",
  id: "repository:broken",
  locationLabel: "本地 · broken",
  message: "仓库元数据损坏。",
  severity: "error",
  source: "repository",
  target: { issueId: "broken", kind: "repository-issue" },
};

const journalProblem: JournalDiagnostic = {
  code: "unresolved-journal-reference",
  id: "journal:reference:unresolved:journal-entry-00000000-0000-4000-8000-000000000001:missing",
  locationLabel: "2026-01-02 11:04:05 · L2",
  message: "无法解析日记引用“missing”。",
  severity: "warning",
  source: "reference",
  target: {
    entryId: "journal-entry-00000000-0000-4000-8000-000000000001",
    kind: "journal-entry-line",
    lineNumber: 2,
  },
};

describe("ProblemsPanel", () => {
  it("renders a compact collapsed summary without mounting the list", () => {
    const markup = renderToStaticMarkup(
      <ProblemsPanel
        expanded={false}
        onOpen={() => undefined}
        onToggle={() => undefined}
        view={{
          errorCount: 1,
          problems: [diagnostic],
          status: "collecting",
          warningCount: 2,
        }}
      />,
    );

    expect(markup).toContain("问题");
    expect(markup).toContain("正在检查");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain(
      'aria-label="展开问题面板，1 个错误，2 个警告，正在检查"',
    );
    expect(markup).not.toContain('aria-label="问题列表"');
  });

  it("renders one ungrouped dense list and its navigation metadata", () => {
    const markup = renderToStaticMarkup(
      <ProblemsPanel
        expanded
        onOpen={() => undefined}
        onToggle={() => undefined}
        view={{
          errorCount: 1,
          problems: [diagnostic],
          status: "ready",
          warningCount: 0,
        }}
      />,
    );

    expect(markup).toContain('aria-label="问题列表"');
    expect(markup).toContain("problems-row-message");
    expect(markup).toContain("笔记 · 示例 · L2:C2");
    expect(markup).not.toContain("问题来源");
  });

  it("renders repository problems in the same dense list", () => {
    const markup = renderToStaticMarkup(
      <ProblemsPanel
        expanded
        onOpen={() => undefined}
        onToggle={() => undefined}
        view={{
          errorCount: 1,
          problems: [repositoryProblem],
          status: "ready",
          warningCount: 0,
        }}
      />,
    );

    expect(markup).toContain("仓库元数据损坏。");
    expect(markup).toContain("仓库 · 本地 · broken");
  });

  it("labels Journal diagnostics without treating them as workspace references", () => {
    const markup = renderToStaticMarkup(
      <ProblemsPanel
        expanded
        onOpen={() => undefined}
        onToggle={() => undefined}
        view={{
          errorCount: 0,
          problems: [journalProblem],
          status: "ready",
          warningCount: 1,
        }}
      />,
    );

    expect(markup).toContain("无法解析日记引用");
    expect(markup).toContain(
      "日记引用 · 2026-01-02 11:04:05 · L2",
    );
    expect(markup).not.toContain(
      '<span class="problems-row-meta">引用 · 2026-01-02 11:04:05 · L2',
    );
  });

  it("uses the existing virtual collection only above 500 rows", () => {
    expect(shouldVirtualizeProblems(problemsVirtualizationThreshold)).toBe(false);
    expect(shouldVirtualizeProblems(problemsVirtualizationThreshold + 1)).toBe(true);

    const problems = Array.from(
      { length: problemsVirtualizationThreshold + 1 },
      (_, index) => ({
        ...diagnostic,
        id: `${diagnostic.id}-${index}`,
      }),
    );
    const markup = renderToStaticMarkup(
      <ProblemsPanel
        expanded
        onOpen={() => undefined}
        onToggle={() => undefined}
        view={{
          errorCount: problems.length,
          problems,
          status: "ready",
          warningCount: 0,
        }}
      />,
    );

    expect(markup).toContain(
      `data-virtual-row-count="${problemsVirtualizationThreshold + 1}"`,
    );
  });

  it("shows the single-line ready empty state", () => {
    const markup = renderToStaticMarkup(
      <ProblemsPanel
        expanded
        onOpen={() => undefined}
        onToggle={() => undefined}
        view={{ errorCount: 0, problems: [], status: "ready", warningCount: 0 }}
      />,
    );

    expect(markup).toContain("没有问题。");
  });
});
