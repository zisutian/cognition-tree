import {
  UiButton,
  UiEmptyState,
  UiPanel,
  UiStatus,
} from "../../shared/primitives";

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
    <UiPanel
      aria-label="仓库语法未配置"
      centered
      className="syntax-setup-panel"
      fullWidth
      variant="main"
    >
      <UiEmptyState
        actions={
          <>
            <UiButton
              onClick={onConfigureSyntax}
              type="button"
              variant="primary"
            >
              配置语法
            </UiButton>
            <UiButton
              onClick={onUseDefaultSyntax}
              type="button"
              variant="secondary"
            >
              使用默认配置
            </UiButton>
          </>
        }
        description="需要先配置仓库语法，才能解析、编辑和迁移 CTN 笔记。"
        title="仓库语法未配置"
      />
      {errorMessage ? (
        <UiStatus tone="error">
          <p>{errorMessage}</p>
        </UiStatus>
      ) : null}
    </UiPanel>
  );
}
