import { Trash2 } from "lucide-react";
import type {
  RepositoryOption,
  RepositoryViewModel,
} from "../../../application/repository/index.ts";

import {
  Button,
  cx,
  ToolSection,
} from "../../ui/index.ts";

import { RepositoryDeleteConfirmation } from "./RepositoryDeleteConfirmation.tsx";

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
  onDelete: () => Promise<boolean>;
  onStart: () => void;
}) {
  const active = repository.id === view.activeRepositoryId;

  return (
    <ToolSection
      className="repository-danger-zone"
      title="危险区"
      tone="danger"
    >
      <div
        className={cx(
          "repository-danger-zone-content",
          confirming && "is-confirming",
        )}
      >
        {confirming ? (
          <RepositoryDeleteConfirmation
            key={repository.id}
            repository={repository}
            onCancel={onCancel}
            onDelete={onDelete}
          />
        ) : (
          <Button
            disabled={busy || (active && view.deletionBlocked)}
            onClick={onStart}
            type="button"
            variant="danger"
          >
            <Trash2 aria-hidden="true" size={13} />
            删除仓库
          </Button>
        )}
      </div>
    </ToolSection>
  );
}
