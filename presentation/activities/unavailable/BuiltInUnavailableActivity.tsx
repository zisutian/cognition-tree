import { Button, EmptyState } from "compact-ui";
import type {
  BuiltInCatalogApplication,
  BuiltInId,
} from "../../../application/repository/index.ts";

import { Page, useFeedback } from "../../ui/index.ts";

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
    const hasIssue =
      catalogState.status === "ready" &&
      catalogState.issues.some(({ id }) => id === builtInId);

    return hasIssue ? () => catalog.retry(builtInId) : catalog.reload;
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
  const title =
    application.status === "loading"
      ? `正在载入${label}`
      : application.status === "failed"
        ? `${label}无法挂载`
        : catalog.state.status === "failed"
          ? "内置数据无法载入"
          : `${label}尚未就绪`;
  const description =
    application.status === "failed"
      ? application.errorMessage
      : catalog.state.status === "failed"
        ? catalog.state.errorMessage
        : undefined;
  const retry = resolveBuiltInActivityRetry(application, catalog, builtInId);

  return (
    <Page aria-label={title} kind="empty">
      <EmptyState
        action={
          <>
            {retry ? (
              <Button
                onClick={() => void feedback.runAction(retry)}
                type="button"
                variant="normal"
              >
                重试
              </Button>
            ) : null}
            <Button onClick={onOpenRepository} type="button" variant="normal">
              前往仓库
            </Button>
          </>
        }
        description={description}
        title={title}
      />
    </Page>
  );
}
