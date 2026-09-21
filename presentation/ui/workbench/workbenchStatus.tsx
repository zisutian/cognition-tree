import { CircleX, TriangleAlert } from "lucide-react";
import { StatusText } from "compact-ui";
import { Button } from "compact-ui";
import type { Ref } from "react";
export function createWorkbenchStatus({
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
  return {
    start: (
      <Button
        aria-label={`${label}，${errorCount} 个错误，${warningCount} 个警告`}
        aria-expanded={expanded}
        onClick={onToggleProblems}
        ref={toggleButtonRef}
      >
        <CircleX />
        {errorCount}
        <TriangleAlert />
        {warningCount}
      </Button>
    ),
    end: (
      <StatusText
        mode="live"
        tone={errorCount ? "danger" : warningCount ? "warning" : "neutral"}
      >
        {statusMessage}
      </StatusText>
    ),
  };
}
