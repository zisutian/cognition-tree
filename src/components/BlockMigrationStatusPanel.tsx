export type BlockMigrationPanelStatus = {
  details?: string[];
  message: string;
  status: "blocked" | "failed" | "idle" | "ready" | "success";
};

type BlockMigrationStatusPanelProps = {
  resultStatus: BlockMigrationPanelStatus | null;
  selectionStatus: BlockMigrationPanelStatus;
};

export function BlockMigrationStatusPanel({
  resultStatus,
  selectionStatus,
}: BlockMigrationStatusPanelProps) {
  return (
    <aside className="workspace-detail-panel" aria-label="迁移状态">
      <header className="panel-header compact">
        <div>
          <p className="eyebrow">Migration</p>
          <h2>迁移</h2>
        </div>
      </header>

      <div className="workspace-detail-body">
        {resultStatus ? (
          <section className={`workspace-status ${resultStatus.status}`}>
            <p>{resultStatus.message}</p>
          </section>
        ) : null}

        <section className={`workspace-status ${selectionStatus.status}`}>
          <p>{selectionStatus.message}</p>
          {selectionStatus.details && selectionStatus.details.length > 0 ? (
            <ul>
              {selectionStatus.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </aside>
  );
}
