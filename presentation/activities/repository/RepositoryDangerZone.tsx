import { Trash2 } from "lucide-react";
import type { DeleteRepositoryRequest } from "../../../application/repository/repositoryCatalog";
import type {
  RepositoryOption,
  RepositoryViewModel,
} from "../../../application/repository/repositoryViewModel";
import { Button, Section, cx } from "../../ui/shared/primitives";
import { RepositoryDeleteConfirmation } from "./RepositoryDeleteConfirmation";

export function RepositoryDangerZone({
  busy,
  confirming,
  repository,
  view,
  onCancel,
  onDelete,
  onStart,
}: {
  busy: boolean;
  confirming: boolean;
  repository: RepositoryOption;
  view: RepositoryViewModel;
  onCancel: () => void;
  onDelete: (mode: DeleteRepositoryRequest["mode"]) => Promise<boolean>;
  onStart: () => void;
}) {
  const active = repository.id === view.activeRepositoryId;

  return (
    <Section
      className="repository-section repository-danger-zone"
      title="危险区"
    >
      <div
        className={cx(
          "repository-danger-zone-content",
          confirming && "is-confirming",
        )}
      >
        <div>
          <strong>删除仓库</strong>
          <p>
            {repository.adapter === "webdav"
              ? "可以只移除本机连接；删除远端托管数据后无法恢复。"
              : "删除托管数据后无法恢复。"}
          </p>
          {!confirming && active && view.deletionWarning ? (
            <p className="repository-warning" role="alert">
              {view.deletionWarning}
            </p>
          ) : null}
        </div>
        {confirming ? (
          <RepositoryDeleteConfirmation
            key={repository.id}
            repository={repository}
            warning={active ? view.deletionWarning : ""}
            onCancel={onCancel}
            onDelete={onDelete}
          />
        ) : (
          <Button
            className="ui-button-danger"
            disabled={busy || (active && view.deletionBlocked)}
            onClick={onStart}
            type="button"
            variant="secondary"
          >
            <Trash2 aria-hidden="true" size={13} />
            删除仓库
          </Button>
        )}
      </div>
    </Section>
  );
}
