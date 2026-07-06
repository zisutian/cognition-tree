import { RefreshCw } from "lucide-react";

type SettingsSidebarPanelProps = {
  canChangeRepositoryPath: boolean;
  repositoryPath: string;
  saveStatusLabel: string;
  storageLabel: string;
  onChangeRepositoryPath: (path: string) => void;
  onReload: () => void;
};

export function SettingsSidebarPanel({
  canChangeRepositoryPath,
  repositoryPath,
  saveStatusLabel,
  storageLabel,
  onChangeRepositoryPath,
  onReload,
}: SettingsSidebarPanelProps) {
  const requestRepositoryPath = () => {
    if (!canChangeRepositoryPath) {
      return;
    }

    const nextPath = window.prompt("仓库文件夹路径", repositoryPath);

    if (nextPath) {
      onChangeRepositoryPath(nextPath);
    }
  };

  return (
    <div className="side-panel-body">
      <section className="side-section">
        <div className="side-section-header">
          <p className="side-section-title">仓库</p>
          <div className="side-action-group">
            <button
              className="side-action-button"
              onClick={onReload}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={13} strokeWidth={2} />
              刷新
            </button>
            {canChangeRepositoryPath ? (
              <button
                className="side-action-button"
                onClick={requestRepositoryPath}
                type="button"
              >
                更改
              </button>
            ) : null}
          </div>
        </div>
        <div className="repository-strip">
          <span>
            {storageLabel} · {saveStatusLabel}
          </span>
          <code>{repositoryPath || "加载中"}</code>
        </div>
      </section>

      <section className="side-section">
        <p className="side-section-title">偏好</p>
        <div className="side-entry-list">
          <button className="side-entry" disabled type="button">
            外观
          </button>
          <button className="side-entry" disabled type="button">
            快捷键
          </button>
          <button className="side-entry" disabled type="button">
            许可证
          </button>
        </div>
      </section>
    </div>
  );
}
