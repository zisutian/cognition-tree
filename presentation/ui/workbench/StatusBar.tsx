import type { Ref } from "react";
import { CircleX, TriangleAlert } from "lucide-react";
import { Button } from "../shared/primitives.tsx";

export function StatusBar({
  errorCount,
  warningCount,
  expanded,
  onToggleProblems,
  statusMessage,
  toggleButtonRef,
}: {
  errorCount: number;
  warningCount: number;
  expanded: boolean;
  onToggleProblems(): void;
  statusMessage: string;
  toggleButtonRef?: Ref<HTMLButtonElement>;
}) {
  const label = expanded ? "折叠问题面板" : "展开问题面板";
  return (
    <footer role="contentinfo" aria-label="工作台状态" className="workbench-status-bar">
      <Button
        aria-controls="workbench-problems"
        aria-expanded={expanded}
        aria-label={`${label}，${errorCount} 个错误，${warningCount} 个警告${statusMessage ? `，${statusMessage}` : ""}`}
        className="workbench-status-problems"
        onClick={onToggleProblems}
        ref={toggleButtonRef}
        title={label}
        type="button"
        variant="bare"
      >
        <CircleX aria-hidden="true" size={14} />
        <span>{errorCount}</span>
        <TriangleAlert aria-hidden="true" size={14} />
        <span>{warningCount}</span>
      </Button>
      <span role="status" className="workbench-status-message" title={statusMessage}>
        {statusMessage}
      </span>
    </footer>
  );
}
