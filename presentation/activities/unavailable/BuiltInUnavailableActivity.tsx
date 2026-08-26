import type { BuiltInId } from "../../../application/repository/builtInCatalog";
import type { BuiltInCatalogApplication } from "../../../application/repository/builtInCatalogController";
import { useFeedback } from "../../ui/shared/FeedbackProvider";
import {
  Button,
  EmptyState,
  Panel,
} from "../../ui/shared/primitives";

type BuiltInUnavailableApplication =
  | { status: "loading" }
  | { reload: () => Promise<void>; status: "unavailable" }
  | {
      errorMessage: string;
      reload: () => Promise<void>;
      status: "failed";
    };

export function resolveBuiltInActivityRetry(
  application: BuiltInUnavailableApplication,
  catalog: BuiltInCatalogApplication,
  builtInId: BuiltInId,
) {
  if (application.status === "failed") {
    return application.reload;
  }
  const catalogState = catalog.state;

  if (application.status === "unavailable") {
    const hasIssue = catalogState.status === "ready" &&
      catalogState.issues.some(({ id }) => id === builtInId);

    return hasIssue
      ? () => catalog.retry(builtInId)
      : catalog.reload;
  }
  return catalogState.status === "failed" ? catalog.reload : null;
}

export function BuiltInUnavailableActivity({
  application,
  builtInId,
  catalog,
  label,
  onOpenRepository,
}: {
  application: BuiltInUnavailableApplication;
  builtInId: BuiltInId;
  catalog: BuiltInCatalogApplication;
  label: "代办" | "日记";
  onOpenRepository: () => void;
}) {
  const feedback = useFeedback();
  const title = application.status === "loading"
    ? `正在载入${label}`
    : application.status === "failed"
      ? `${label}无法挂载`
      : catalog.state.status === "failed"
        ? "内置数据无法载入"
        : `${label}尚未就绪`;
  const description = application.status === "loading"
    ? `正在读取受保护的内置${label}仓库。`
    : application.status === "failed"
      ? application.errorMessage
      : catalog.state.status === "failed"
        ? catalog.state.errorMessage
        : `内置${label}数据正在等待创建或重新连接。`;
  const retry = resolveBuiltInActivityRetry(application, catalog, builtInId);

  return (
    <Panel aria-label={title} className="placeholder-panel">
      <EmptyState
        action={(
          <>
            {retry ? (
              <Button
                onClick={() => void feedback.runAction(retry)}
                type="button"
                variant="secondary"
              >
                重试
              </Button>
            ) : null}
            <Button
              onClick={onOpenRepository}
              type="button"
              variant="primary"
            >
              前往仓库
            </Button>
          </>
        )}
        description={description}
        title={title}
      />
    </Panel>
  );
}
