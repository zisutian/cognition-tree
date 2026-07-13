import { Button, EmptyState, Panel } from "./shared/primitives";

export function SessionStateView({
  errorMessage,
  status,
  storageLabel,
  onRetry,
}: {
  errorMessage?: string;
  status: "failed" | "loading";
  storageLabel: string;
  onRetry?: () => void;
}) {
  const failed = status === "failed";

  return (
    <main
      aria-busy={!failed}
      aria-live="polite"
      className="session-state-frame"
    >
      <Panel aria-label={failed ? "仓库加载失败" : "正在加载仓库"}>
        <EmptyState
          action={
            failed && onRetry ? (
              <Button onClick={onRetry} type="button" variant="primary">
                重新加载
              </Button>
            ) : null
          }
          description={
            failed
              ? errorMessage ?? "无法读取仓库快照。"
              : `正在从${storageLabel}读取仓库快照。`
          }
          title={failed ? "仓库加载失败" : "正在加载仓库"}
        />
      </Panel>
    </main>
  );
}
