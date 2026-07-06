type SyntaxSetupPanelProps = {
  onConfigureSyntax: () => void;
  onUseDefaultSyntax: () => void;
  errorMessage: string;
};

export function SyntaxSetupPanel({
  onConfigureSyntax,
  onUseDefaultSyntax,
  errorMessage,
}: SyntaxSetupPanelProps) {
  return (
    <section
      aria-label="仓库语法未配置"
      className="activity-main-panel migration-full-width syntax-setup-panel"
    >
      <div className="syntax-setup-empty">
        <h2>仓库语法未配置</h2>
        <p>需要先配置仓库语法，才能解析、编辑和迁移 CTN 笔记。</p>
        <div className="syntax-setup-actions">
          <button
            className="primary-action-button"
            onClick={onConfigureSyntax}
            type="button"
          >
            配置语法
          </button>
          <button
            className="secondary-action-button"
            onClick={onUseDefaultSyntax}
            type="button"
          >
            使用默认配置
          </button>
        </div>
        {errorMessage ? (
          <p className="syntax-setup-error">{errorMessage}</p>
        ) : null}
      </div>
    </section>
  );
}
